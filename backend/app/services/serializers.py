"""ORM -> JSON dicts matching frontend/src/types/index.ts."""
from app.core.config import get_settings
from app.core.util import iso, naive_utcnow
from app.models import Approval, AuditLog, Merchant, Payment, Policy, PurchaseRequest, Transaction
from app.schemas.policy import POLICY_FIELDS


def pr_out(pr: PurchaseRequest) -> dict:
    return {"id": pr.id, "item": pr.item, "merchant": pr.merchant, "amount": pr.amount, "currency": pr.currency, "description": pr.description,
            "reason": pr.reason, "priority": pr.priority, "agent_name": pr.agent_name, "status": pr.status,
            "policy_evaluation": pr.policy_evaluation, "risk_assessment": pr.risk_assessment, "approval_status": pr.approval_status,
            "payment_status": pr.payment_status, "ai_explanation": pr.ai_explanation, "source_prompt": pr.source_prompt,
            "created_at": iso(pr.created_at), "data_source": pr.data_source}


def tx_out(t: Transaction) -> dict:
    return {"id": t.id, "purchase_request_id": t.purchase_request_id, "merchant": t.merchant, "amount": t.amount, "currency": t.currency,
            "risk_score": t.risk_score, "risk_category": t.risk_category, "policy_decision": t.policy_decision, "payment_status": t.payment_status,
            "paypal_order_id": t.paypal_order_id, "created_at": iso(t.created_at), "data_source": t.data_source}


def approval_out(a: Approval) -> dict:
    return {"id": a.id, "purchase_request": pr_out(a.purchase_request), "status": a.status, "decided_at": iso(a.decided_at), "decision_note": a.decision_note}


def payment_out(p: Payment) -> dict:
    held = p.status in ("authorized", "partially_captured")
    secs = int((p.authorization_expires_at - naive_utcnow()).total_seconds()) if held and p.authorization_expires_at else None
    captured = p.captured_amount or 0.0
    return {"id": p.id, "purchase_request_id": p.purchase_request_id, "paypal_order_id": p.paypal_order_id, "status": p.status, "amount": p.amount,
            "currency": p.currency, "approval_url": p.approval_url, "captured_at": iso(p.captured_at), "data_source": p.data_source,
            "intent": p.intent, "authorization_id": p.authorization_id, "authorization_expires_at": iso(p.authorization_expires_at),
            "expires_in_seconds": secs, "expiring_soon": secs is not None and secs < get_settings().auth_expiry_warn_hours * 3600,
            "funds_held": held, "captured_amount": captured, "remaining_authorized": round(p.amount - captured, 2) if held else 0.0,
            "autonomous": bool(p.autonomous), "agent_name": p.agent_name, "hold_explanation": p.hold_explanation, "hold_explanation_source": p.hold_explanation_source}


def merchant_out(m: Merchant) -> dict:
    return {"id": m.id, "name": m.name, "category": m.category, "status": m.status, "trust_score": m.trust_score,
            "per_transaction_limit": m.per_transaction_limit, "monthly_limit": m.monthly_limit, "currency": m.currency}


def policy_out(p: Policy) -> dict:
    d = {k: getattr(p, k) for k in POLICY_FIELDS}
    d["updated_at"] = iso(p.updated_at)
    return d


def audit_out(a: AuditLog) -> dict:
    return {"id": a.id, "actor": a.actor, "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id, "detail": a.detail,
            "created_at": iso(a.created_at), "data_source": a.data_source}
