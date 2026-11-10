"""Per-transaction timeline: audit log entries (AgentGuard / Agent via MCP) merged with stored PayPal webhook events."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.util import iso, utcnow
from app.models import AuditLog, Payment, PurchaseRequest, Transaction, TransactionEvent

SRC_APP, SRC_AGENT, SRC_PAYPAL = "AgentGuard", "Agent via MCP", "PayPal webhook"
TERMINAL = {"captured", "voided", "expired", "failed", "refunded"}

# action -> (title, icon)
LABELS = {
    "purchase_request.created": ("Request submitted", "request"), "policy.auto_approved": ("Policy decision: auto-approved", "policy"),
    "policy.needs_approval": ("Policy decision: needs human approval", "policy"), "policy.blocked": ("Policy decision: blocked", "blocked"),
    "wallet.guardrail_fallback": ("Agent limit reached: sent to human approval", "policy"),
    "approval.approved": ("Human approved", "approval"), "approval.rejected": ("Human rejected", "approval"),
    "payment.order_created": ("PayPal order created", "order"), "payment.authorized": ("Funds held (authorized)", "authorize"),
    "payment.captured": ("Payment captured", "capture"), "payment.partially_captured": ("Partial capture", "capture"),
    "payment.autonomous_charge": ("Charged by agent via PayPal Vault (no human click)", "agent"),
    "payment.voided": ("Hold voided: nothing charged", "void"), "payment.remainder_released": ("Unused part of the hold released", "void"),
    "payment.expired": ("Authorization expired", "void"), "payment.refund": ("Refund issued", "refund"), "payment.failed": ("Payment failed", "blocked"),
    "payment.reauthorized": ("Authorization renewed", "authorize"), "payment.void_failed": ("Void failed", "blocked"),
    "payment.capture_declined": ("Capture declined", "blocked"), "payment.amount_mismatch": ("Amount mismatch flagged", "blocked"),
    "wallet.charge_failed": ("Vault charge failed", "blocked"),
}
WEBHOOK_TITLES = {
    "CHECKOUT.ORDER.APPROVED": "PayPal: buyer approved the order", "PAYMENT.AUTHORIZATION.CREATED": "PayPal: authorization created (funds held)",
    "PAYMENT.AUTHORIZATION.VOIDED": "PayPal: authorization voided", "PAYMENT.CAPTURE.COMPLETED": "PayPal: capture completed",
    "PAYMENT.CAPTURE.DENIED": "PayPal: capture denied", "PAYMENT.CAPTURE.DECLINED": "PayPal: capture declined",
    "PAYMENT.CAPTURE.REFUNDED": "PayPal: capture refunded", "PAYMENT.CAPTURE.REVERSED": "PayPal: capture reversed",
}
SIMULATABLE = ("CHECKOUT.ORDER.APPROVED", "PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.AUTHORIZATION.VOIDED")


def _ids(p: Payment | None, extra: dict | None = None) -> dict:
    d = {"order_id": p.paypal_order_id if p else None, "authorization_id": p.authorization_id if p else None, "capture_id": p.paypal_capture_id if p else None}
    d.update({k: v for k, v in (extra or {}).items() if v})
    return {k: v for k, v in d.items() if v}


def record_webhook_event(db: Session, payment: Payment, event: dict, *, verified: bool = True, simulated: bool = False) -> TransactionEvent | None:
    """Store one webhook event for the timeline. Idempotent by PayPal event id (returns None for a duplicate). Caller commits."""
    eid = str(event.get("id") or "")[:80]
    if not eid or db.scalar(select(TransactionEvent.id).where(TransactionEvent.paypal_event_id == eid)):
        return None
    res = event.get("resource") or {}
    ev = TransactionEvent(user_id=payment.user_id, purchase_request_id=payment.purchase_request_id, payment_id=payment.id, paypal_event_id=eid,
                          event_type=str(event.get("event_type", ""))[:60], paypal_ids=_ids(payment, {"resource_id": res.get("id")}), verified=verified, simulated=simulated)
    db.add(ev)
    db.flush()
    return ev


def _audit_source(a: AuditLog) -> str:
    if a.actor.startswith("agent:"):
        return SRC_AGENT
    if a.actor.startswith("paypal:"):
        return SRC_PAYPAL
    return SRC_APP


def build_timeline(db: Session, tx: Transaction) -> list[dict]:
    pr = db.get(PurchaseRequest, tx.purchase_request_id) if tx.purchase_request_id else None
    if pr is None:
        return []
    pays = {p.id: p for p in db.scalars(select(Payment).where(Payment.purchase_request_id == pr.id))}
    logs = db.scalars(select(AuditLog).where(AuditLog.user_id == tx.user_id, AuditLog.entity_id.in_([pr.id, *pays]), AuditLog.action != "paypal.webhook")).all()
    items: list[tuple] = []
    for a in logs:
        title, icon = LABELS.get(a.action, (a.action.replace("_", " ").replace(".", ": "), "info"))
        src = _audit_source(a)
        if a.action == "purchase_request.created" and pr.agent_name:
            src = SRC_AGENT
        ids = _ids(pays.get(a.entity_id)) if a.entity_type == "payment" else {}
        items.append((a.created_at, 0, {"id": a.id, "kind": a.action, "title": title, "detail": a.detail, "source": src, "icon": icon, "paypal_ids": ids,
                                        "highlight": False, "verified": None, "simulated": False}))
    for e in db.scalars(select(TransactionEvent).where(TransactionEvent.purchase_request_id == pr.id)):
        title = WEBHOOK_TITLES.get(e.event_type, f"PayPal event {e.event_type}")
        detail = ("Simulated by the sandbox helper: shown on the timeline only, no payment state was changed." if e.simulated
                  else ("Signature verified by PayPal." if e.verified else "Signature not verified."))
        items.append((e.created_at, 1, {"id": e.id, "kind": e.event_type, "title": title + (" (simulated)" if e.simulated else ""), "detail": detail, "source": SRC_PAYPAL,
                                        "icon": "webhook", "paypal_ids": {**e.paypal_ids, "event_id": e.paypal_event_id}, "highlight": not e.simulated,
                                        "verified": e.verified and not e.simulated, "simulated": e.simulated}))
    items.sort(key=lambda t: (t[0], t[1]))
    return [{**d, "at": iso(at)} for at, _, d in items]


def is_live(tx: Transaction, pr: PurchaseRequest | None) -> bool:
    if tx.policy_decision == "blocked" or (pr is not None and pr.status in ("blocked", "rejected")):
        return False
    return tx.payment_status not in TERMINAL


def simulate_event(db: Session, tx: Transaction, event_type: str) -> TransactionEvent:
    """Sandbox helper: add a clearly labelled, unverified PayPal-style event to the timeline. Never touches payment state."""
    from app.core.errors import AppError
    from app.core.util import new_id
    if event_type not in SIMULATABLE:
        raise AppError(422, "bad_event_type", f"event_type must be one of {', '.join(SIMULATABLE)}.")
    payment = db.scalar(select(Payment).where(Payment.purchase_request_id == tx.purchase_request_id).order_by(Payment.created_at.desc()))
    if payment is None:
        raise AppError(409, "no_payment", "This transaction has no PayPal payment yet, so there is nothing to simulate.")
    ev = record_webhook_event(db, payment, {"id": new_id("SIM-"), "event_type": event_type, "resource": {"id": payment.paypal_capture_id or payment.authorization_id or payment.paypal_order_id}},
                              verified=False, simulated=True)
    from app.services import audit
    audit.record(db, actor=payment.user_id, user_id=payment.user_id, action="timeline.webhook_simulated", entity_type="payment", entity_id=payment.id,
                 detail=f"Sandbox helper added a simulated {event_type} event (no payment state change).")
    db.commit()
    return ev
