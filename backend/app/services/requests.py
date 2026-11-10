"""Purchase request pipeline: policy engine + risk engine decide; AI only explains."""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents import risk_explainer
from app.agents.gemini import GeminiClient
from app.core.errors import AppError
from app.core.util import iso, naive_utcnow, utcnow
from app.models import Approval, Merchant, Policy, PurchaseRequest, Transaction, User
from app.policies import (
    AUTO, BLOCKED, NEEDS, MerchantInfo, PolicyConfig, PurchaseInput, SpendHistory, Violation, assess_risk, evaluate_policy, final_decision,
)
from app.schemas.purchase import PurchaseRequestCreate
from app.services import audit
from app.services.seed import default_policy_for

COMMITTED = ("approved", "paid")
DEAD = ("blocked", "rejected", "failed")


def policy_config(p: Policy) -> PolicyConfig:
    return PolicyConfig(max_auto_amount=p.max_auto_amount, max_transaction_amount=p.max_transaction_amount, daily_limit=p.daily_limit,
                        manual_approval_threshold=p.manual_approval_threshold, allowed_currencies=tuple(p.allowed_currencies),
                        approved_merchants=tuple(p.approved_merchants), restricted_merchants=tuple(p.restricted_merchants),
                        duplicate_protection=p.duplicate_protection, duplicate_window_minutes=p.duplicate_window_minutes)


def find_merchant(db: Session, name: str) -> Merchant | None:
    return db.scalar(select(Merchant).where(func.lower(Merchant.name) == " ".join(name.split()).casefold()))


def merchant_info(m: Merchant | None) -> MerchantInfo | None:
    return None if m is None else MerchantInfo(m.name, m.status, m.trust_score, m.category, m.per_transaction_limit, m.monthly_limit)


def spend_history(db: Session, user_id: str, data: PurchaseRequestCreate, policy: Policy) -> SpendHistory:
    now = naive_utcnow()
    day0, month0 = now.replace(hour=0, minute=0, second=0, microsecond=0), now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    base = [PurchaseRequest.user_id == user_id, PurchaseRequest.currency == data.currency]
    today = db.scalar(select(func.coalesce(func.sum(PurchaseRequest.amount), 0.0)).where(*base, PurchaseRequest.status.in_(COMMITTED), PurchaseRequest.created_at >= day0))
    month = db.scalar(select(func.coalesce(func.sum(PurchaseRequest.amount), 0.0)).where(
        *base, PurchaseRequest.status.in_(COMMITTED), PurchaseRequest.created_at >= month0, func.lower(PurchaseRequest.merchant) == data.merchant.casefold()))
    dups = db.scalar(select(func.count()).select_from(PurchaseRequest).where(
        *base, func.lower(PurchaseRequest.merchant) == data.merchant.casefold(), PurchaseRequest.amount == data.amount,
        PurchaseRequest.status.notin_(DEAD), PurchaseRequest.created_at >= now - timedelta(minutes=policy.duplicate_window_minutes)))
    return SpendHistory(float(today), float(month), int(dups))


def create_purchase_request(db: Session, user: User, data: PurchaseRequestCreate, gemini: GeminiClient | None, *, agent_name: str | None,
                            source_prompt: str | None = None) -> PurchaseRequest:
    policy = default_policy_for(user.id, db)
    cfg, merchant = policy_config(policy), find_merchant(db, data.merchant)
    minfo, history = merchant_info(merchant), spend_history(db, user.id, data, policy)
    inp = PurchaseInput(data.item, data.merchant, data.amount, data.currency, data.description, data.reason, data.priority)

    pol = evaluate_policy(inp, cfg, minfo, history)
    risk = assess_risk(inp, cfg, minfo, history, pol)
    decision = final_decision(pol, risk)
    violations = list(pol.violations)
    if decision != pol.decision:
        violations.append(Violation("high_risk_score", f"Risk score {risk.score}/100 ({risk.category}) requires a human review.", "warning"))
    vdicts = [v.to_dict() for v in violations]
    fdicts = [f.to_dict() for f in risk.factors]
    text, esrc = risk_explainer.explain(decision, risk.score, risk.category, vdicts, fdicts, data.merchant, data.item, data.amount, data.currency, gemini)

    now = iso(utcnow())
    pr = PurchaseRequest(
        user_id=user.id, item=data.item, merchant=data.merchant, amount=data.amount, currency=data.currency, description=data.description,
        reason=data.reason, priority=data.priority, agent_name=agent_name, source_prompt=source_prompt, ai_explanation=text,
        policy_evaluation={"decision": decision, "violations": vdicts, "evaluated_at": now, "source": "backend"},
        risk_assessment={"score": risk.score, "category": risk.category, "factors": fdicts, "explanation": text, "explanation_source": esrc,
                         "source": "backend", "generated_at": now},
        status={AUTO: "approved", NEEDS: "pending_approval", BLOCKED: "blocked"}[decision],
        approval_status="pending" if decision == NEEDS else "not_required", data_source="backend")
    db.add(pr)
    db.flush()
    db.add(Transaction(user_id=user.id, purchase_request_id=pr.id, merchant=pr.merchant, amount=pr.amount, currency=pr.currency, risk_score=risk.score,
                       risk_category=risk.category, policy_decision=decision, payment_status="not_started", data_source="backend"))
    if decision == NEEDS:
        db.add(Approval(purchase_request_id=pr.id, user_id=user.id, status="pending"))
    actor = f"agent:{agent_name}" if agent_name else user.id
    audit.record(db, actor=actor, user_id=user.id, action="purchase_request.created", entity_type="purchase_request", entity_id=pr.id,
                 detail=f"{data.item} at {data.merchant} for {data.amount:.2f} {data.currency}.")
    audit.record(db, actor="system", user_id=user.id, action=f"policy.{decision}", entity_type="purchase_request", entity_id=pr.id,
                 detail=f"Risk {risk.score}/100 ({risk.category}). " + ("; ".join(v["message"] for v in vdicts if v["severity"] != "info") or "No rule violations."))
    db.commit()
    return pr


def decide_approval(db: Session, user: User, approval_id: str, decision: str, note: str | None, paypal=None) -> Approval:
    a = db.get(Approval, approval_id)
    if a is None or a.user_id != user.id:
        raise AppError(404, "not_found", "Approval not found.")
    if a.status != "pending":
        raise AppError(409, "already_decided", f"This request was already {a.status}.")
    pr = a.purchase_request
    a.status, a.decided_at, a.decision_note = decision, naive_utcnow(), note
    pr.approval_status = decision
    pr.status = "approved" if decision == "approved" else "rejected"
    tx = db.scalar(select(Transaction).where(Transaction.purchase_request_id == pr.id))
    if tx and decision == "rejected":
        tx.payment_status = "not_started"
    audit.record(db, actor=user.id, user_id=user.id, action=f"approval.{decision}", entity_type="purchase_request", entity_id=pr.id,
                 detail=f"Human {decision} {pr.item} at {pr.merchant} ({pr.amount:.2f} {pr.currency})." + (f" Note: {note}" if note else ""))
    db.commit()
    if decision == "rejected" and paypal is not None:
        from app.services import payments  # local import: payments imports agents, avoid a cycle at module load
        payments.release_hold_on_rejection(db, paypal, user, pr)  # funds held by PayPal are released automatically
    return a
