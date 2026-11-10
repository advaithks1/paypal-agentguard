"""Agent wallet: PayPal Vault consent, guardrails, and autonomous (no-redirect) charges.

The policy engine still decides first. A vault charge happens only for auto_approved requests that also pass the
per-agent guardrails; anything else falls back to the normal human approval flow. Blocked never pays.
"""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents import risk_explainer
from app.core.errors import AppError
from app.core.util import iso, naive_utcnow, new_id, utcnow
from app.integrations.paypal import PayPalClient, PayPalError, payment_status_from_capture
from app.models import AgentGuardrail, AgentWallet, Approval, Payment, PurchaseRequest, Transaction, User
from app.policies.guardrails import Guardrail, check_guardrails
from app.services import audit
from app.services.payments import _apply_status, _sync_transaction, paypal_source

import logging
log = logging.getLogger("agentguard.wallet")

DEFAULTS = {"daily_cap": 100.0, "per_transaction_cap": 50.0, "allowed_merchants": []}
VAULT_HELP = ("PayPal Vault is not enabled for this sandbox app. In developer.paypal.com open Apps & Credentials, select your sandbox app, "
              "turn on the 'Vault' feature (and save), then try again. Everything else in AgentGuard keeps working.")


def _vault(fn):
    """Run a PayPal Vault call; turn 'feature not enabled' style failures into one clear, actionable error."""
    try:
        return fn()
    except PayPalError as e:
        if e.upstream_status in (401, 403) or e.name in ("NOT_AUTHORIZED", "PERMISSION_DENIED", "AUTHORIZATION_ERROR") or e.has_issue("PERMISSION_DENIED"):
            said = f" PayPal said: HTTP {e.upstream_status} {e.name} - {str(e).removeprefix('PayPal: ')} (debug_id {e.debug_id})."
            log.warning("Vault call rejected by PayPal: status=%s name=%s msg=%s debug_id=%s issues=%s", e.upstream_status, e.name, e, e.debug_id, (e.details or {}).get("issues"))
            raise AppError(503, "vault_not_enabled", VAULT_HELP + said, e.details) from e
        raise


def get_wallet(db: Session, user_id: str) -> AgentWallet | None:
    return db.scalar(select(AgentWallet).where(AgentWallet.user_id == user_id))


def get_guardrail(db: Session, user_id: str, agent_name: str | None = None) -> AgentGuardrail:
    rows = {g.agent_name: g for g in db.scalars(select(AgentGuardrail).where(AgentGuardrail.user_id == user_id))}
    if agent_name and agent_name in rows:
        return rows[agent_name]
    if "*" in rows:
        return rows["*"]
    g = AgentGuardrail(user_id=user_id, agent_name="*", **DEFAULTS)
    db.add(g)
    db.flush()
    return g


def spent_today(db: Session, user_id: str, currency: str, agent_name: str | None = None) -> float:
    day0 = naive_utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    q = select(func.coalesce(func.sum(Payment.captured_amount), 0.0)).where(
        Payment.user_id == user_id, Payment.autonomous.is_(True), Payment.status == "captured", Payment.currency == currency, Payment.created_at >= day0)
    if agent_name:
        q = q.where(Payment.agent_name == agent_name)
    return float(db.scalar(q) or 0.0)


def recent_charges(db: Session, user_id: str, limit: int = 10) -> list[Payment]:
    return list(db.scalars(select(Payment).where(Payment.user_id == user_id, Payment.autonomous.is_(True)).order_by(Payment.created_at.desc()).limit(limit)))


# ---------------------------------------------------------------- consent
def connect_start(db: Session, client: PayPalClient, user: User, return_url: str, cancel_url: str) -> dict:
    w = get_wallet(db, user.id)
    if w and w.status == "active":
        raise AppError(409, "already_connected", "Your PayPal account is already connected for agent spending. Revoke it first to reconnect.")
    token = _vault(lambda: client.create_setup_token(return_url=return_url, cancel_url=cancel_url, request_id=new_id("rid_")))
    approve = next((l["href"] for l in token.get("links", []) if l.get("rel") in ("approve", "payer-action")), None)
    if not token.get("id") or not approve:
        raise AppError(502, "vault_bad_response", "PayPal did not return a Vault approval link.")
    if w is None:
        w = AgentWallet(user_id=user.id, data_source=paypal_source())
        db.add(w)
    w.status, w.setup_token_id, w.vault_id, w.paypal_customer_id, w.revoked_at = "pending", token["id"], None, None, None
    audit.record(db, actor=user.id, user_id=user.id, action="wallet.consent_started", entity_type="wallet", entity_id=w.id or None,
                 detail="Buyer was sent to PayPal to consent to agent spending (Vault setup token created).", data_source=w.data_source)
    db.commit()
    return {"approval_url": approve, "setup_token_id": token["id"]}


def connect_complete(db: Session, client: PayPalClient, user: User, setup_token_id: str) -> AgentWallet:
    w = get_wallet(db, user.id)
    if w is None or w.setup_token_id != setup_token_id:
        raise AppError(404, "not_found", "No pending wallet consent matches this token.")
    if w.status == "active":
        return w  # idempotent replay of the return page
    if w.status != "pending":
        raise AppError(409, "not_pending", "This consent is no longer pending. Start the connection again.")
    pt = _vault(lambda: client.create_payment_token(setup_token_id, request_id=f"{w.id}-pt"))
    if not pt.get("id"):
        raise AppError(502, "vault_bad_response", "PayPal did not return a vault token.")
    w.vault_id, w.paypal_customer_id = pt["id"], (pt.get("customer") or {}).get("id")
    w.status, w.connected_at = "active", utcnow()
    get_guardrail(db, user.id)
    audit.record(db, actor=user.id, user_id=user.id, action="wallet.connected", entity_type="wallet", entity_id=w.id,
                 detail="Buyer consented: PayPal Vault token saved (id only, no credentials).", data_source=w.data_source)
    db.commit()
    return w


def revoke(db: Session, client: PayPalClient, user: User) -> AgentWallet:
    w = get_wallet(db, user.id)
    if w is None or w.status == "revoked":
        raise AppError(404, "not_found", "No agent wallet is connected.")
    if w.status == "active" and w.vault_id:
        try:
            _vault(lambda: client.delete_payment_token(w.vault_id))
        except PayPalError as e:
            if e.upstream_status != 404:  # already gone at PayPal is fine
                raise
    w.status, w.vault_id, w.revoked_at = "revoked", None, utcnow()
    audit.record(db, actor=user.id, user_id=user.id, action="wallet.revoked", entity_type="wallet", entity_id=w.id,
                 detail="Agent access revoked: PayPal vault token deleted. Agents can no longer charge without a human.", data_source=w.data_source)
    db.commit()
    return w


def update_guardrail(db: Session, user: User, daily_cap: float, per_transaction_cap: float, allowed_merchants: list[str], agent_name: str = "*") -> AgentGuardrail:
    if per_transaction_cap > daily_cap:
        raise AppError(422, "invalid_guardrail", "The per-transaction cap cannot exceed the daily cap.")
    g = db.scalar(select(AgentGuardrail).where(AgentGuardrail.user_id == user.id, AgentGuardrail.agent_name == agent_name))
    if g is None:
        g = AgentGuardrail(user_id=user.id, agent_name=agent_name)
        db.add(g)
    g.daily_cap, g.per_transaction_cap = round(daily_cap, 2), round(per_transaction_cap, 2)
    g.allowed_merchants = sorted({" ".join(m.split()) for m in allowed_merchants if m.strip()})
    g.updated_at = naive_utcnow()
    audit.record(db, actor=user.id, user_id=user.id, action="wallet.guardrails_updated", entity_type="guardrail", entity_id=g.id or None,
                 detail=f"Agent '{agent_name}': daily {g.daily_cap:.2f}, per transaction {g.per_transaction_cap:.2f}, merchants {g.allowed_merchants or 'any'}.")
    db.commit()
    return g


# ---------------------------------------------------------------- autonomous charge
def _fall_back_to_approval(db: Session, pr: PurchaseRequest, violations: list) -> None:
    """Guardrail failed: the request keeps its place in the human flow. Nothing reaches PayPal."""
    vd = [v.to_dict() for v in violations]
    ev = dict(pr.policy_evaluation or {})
    ev["decision"], ev["violations"] = "needs_approval", list(ev.get("violations", [])) + vd
    pr.policy_evaluation, pr.status, pr.approval_status = ev, "pending_approval", "pending"
    ra = dict(pr.risk_assessment or {})
    text = risk_explainer.fallback_explanation("needs_approval", int(ra.get("score", 0)), ra.get("category", "low"), vd, ra.get("factors", []), pr.merchant, pr.amount, pr.currency)
    ra["explanation"], ra["explanation_source"] = text, "rule_based"
    pr.risk_assessment, pr.ai_explanation = ra, text
    if db.scalar(select(Approval.id).where(Approval.purchase_request_id == pr.id)) is None:
        db.add(Approval(purchase_request_id=pr.id, user_id=pr.user_id, status="pending"))
    tx = db.scalar(select(Transaction).where(Transaction.purchase_request_id == pr.id))
    if tx:
        tx.policy_decision = "needs_approval"
    audit.record(db, actor="system", user_id=pr.user_id, action="wallet.guardrail_fallback", entity_type="purchase_request", entity_id=pr.id,
                 detail="Agent guardrail: " + " ".join(v.message for v in violations) + " Sent to human approval; no charge was made.")
    db.commit()


def try_autonomous_charge(db: Session, client: PayPalClient, user: User, pr: PurchaseRequest) -> dict:
    """Returns {"outcome": ..., "payment": Payment|None, "message": str}. outcome in not_applicable | charged | fell_back | failed."""
    decision = (pr.policy_evaluation or {}).get("decision")
    if decision != "auto_approved" or pr.status != "approved":
        return {"outcome": "not_applicable", "payment": None, "message": "Only auto-approved requests can use the agent wallet."}
    w = get_wallet(db, user.id)
    if w is None or w.status != "active" or not w.vault_id:
        return {"outcome": "not_applicable", "payment": None, "message": "Connect your PayPal agent wallet first (Agent Wallet page)."}
    agent = pr.agent_name or "*"
    g = get_guardrail(db, user.id, agent)
    rails = Guardrail(g.daily_cap, g.per_transaction_cap, tuple(g.allowed_merchants or []))
    spent = spent_today(db, user.id, pr.currency, None if g.agent_name == "*" else g.agent_name)
    violations = check_guardrails(pr.amount, pr.merchant, rails, spent)  # BEFORE any vault charge
    if violations:
        _fall_back_to_approval(db, pr, violations)
        return {"outcome": "fell_back", "payment": None, "message": "Outside this agent's limits, so a human must approve it."}
    pay = Payment(user_id=user.id, purchase_request_id=pr.id, amount=pr.amount, currency=pr.currency, data_source=paypal_source(), intent="capture",
                  request_id=new_id("rid_"), autonomous=True, agent_name=agent)
    try:
        res = client.charge_vault(vault_id=w.vault_id, amount=pr.amount, currency=pr.currency, reference_id=pr.id,
                                  description=f"{pr.item} ({pr.merchant})", request_id=pay.request_id)
    except PayPalError as e:
        audit.record(db, actor=f"agent:{agent}", user_id=user.id, action="wallet.charge_failed", entity_type="purchase_request", entity_id=pr.id,
                     detail=f"Vault charge failed: {e.message}", data_source=pay.data_source)
        db.commit()
        return {"outcome": "failed", "payment": None, "message": f"The vault charge failed ({e.message}). The request is still approved: pay it manually."}
    if res.amount is not None and (abs(float(res.amount) - pr.amount) > 0.001 or (res.currency or "").upper() != pr.currency.upper()):
        audit.record(db, actor="system", user_id=user.id, action="payment.amount_mismatch", entity_type="purchase_request", entity_id=pr.id,
                     detail=f"Vault charge captured {res.amount} {res.currency} but expected {pr.amount:.2f} {pr.currency}.", data_source=pay.data_source)
    status = payment_status_from_capture(res.order_status, res.capture_status)
    pay.paypal_order_id, pay.paypal_capture_id = res.order_id or None, res.capture_id
    db.add(pay)
    if status == "captured":
        pay.captured_amount, pay.captured_at = pr.amount, utcnow()
    _apply_status(pr, pay, status)
    _sync_transaction(db, pr, pay)
    audit.record(db, actor=f"agent:{agent}", user_id=user.id, action="payment.autonomous_charge", entity_type="payment", entity_id=pay.id,
                 detail=f"Charged by agent, no human click: {pr.amount:.2f} {pr.currency} at {pr.merchant} via PayPal Vault (order {res.order_id}, {status}).",
                 data_source=pay.data_source)
    db.commit()
    return {"outcome": "charged" if status == "captured" else "failed", "payment": pay,
            "message": f"Charged {pr.amount:.2f} {pr.currency} from your agent wallet with no redirect." if status == "captured" else f"PayPal did not complete the charge (status {status})."}


def wallet_state(db: Session, user: User) -> dict:
    w, g = get_wallet(db, user.id), get_guardrail(db, user.id)
    db.commit()
    spent = spent_today(db, user.id, "USD")
    return {"status": w.status if w else "not_connected", "connected_at": iso(w.connected_at) if w else None, "customer_id": w.paypal_customer_id if w else None,
            "data_source": w.data_source if w else paypal_source(),
            "guardrails": {"agent_name": g.agent_name, "daily_cap": g.daily_cap, "per_transaction_cap": g.per_transaction_cap, "allowed_merchants": g.allowed_merchants or []},
            "budget": {"currency": "USD", "daily_cap": g.daily_cap, "spent_today": round(spent, 2), "remaining_today": round(max(0.0, g.daily_cap - spent), 2)}}
