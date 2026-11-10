"""Payment orchestration: guards + PayPal calls + DB state + audit trail. Server-side amounts only."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import risk_explainer
from app.agents.gemini import GeminiClient
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.util import naive_utcnow, new_id, utcnow
from app.integrations.paypal import (
    PayPalClient, PayPalError, money, payment_status_from_capture, payment_status_from_order, status_from_webhook_event,
)
from app.models import AuditLog, Payment, PurchaseRequest, Transaction, User
from app.services import audit

TERMINAL = {"captured", "refunded", "failed", "voided", "expired"}
# Forward-only payment state machine. voided/expired/failed/refunded are final; nothing ever moves backwards.
RANK = {"not_started": 0, "order_created": 1, "buyer_approved": 2, "authorized": 3, "partially_captured": 4, "captured": 5, "refunded": 6}
FINAL = {"voided", "expired", "failed", "refunded"}
HOLD_STATES = ("authorized", "partially_captured")
AUTH_DEFAULT_DAYS = 29  # PayPal authorizations are valid for 29 days (funds guaranteed for the 3-day honor period)


def can_transition(old: str, new: str) -> bool:
    if old in FINAL or old == new:
        return False
    if new in ("voided", "expired", "failed"):
        return RANK.get(old, 0) <= RANK["authorized"]  # never after any money was captured
    if new == "refunded":
        return old in ("captured", "partially_captured")
    return RANK.get(new, 0) > RANK.get(old, 0)


def parse_paypal_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return None


def resolve_intent(pr: PurchaseRequest, requested: str | None) -> str:
    """AUTHORIZE for needs_approval requests by default, CAPTURE for auto-approved ones; overridable by env or per request."""
    mode = (requested or get_settings().payment_mode or "auto").lower()
    if mode not in ("auto", "authorize", "capture"):
        raise AppError(422, "invalid_intent", "intent must be 'authorize', 'capture' or 'auto'.")
    if mode == "auto":
        return "authorize" if (pr.policy_evaluation or {}).get("decision") == "needs_approval" else "capture"
    return mode


def paypal_source() -> str:
    return "paypal_sandbox" if "sandbox" in get_settings().paypal_base_url else "paypal_live"


def ensure_payable(pr: PurchaseRequest) -> None:
    """Only requests the policy engine allowed (and a human approved if required) may reach PayPal."""
    decision = (pr.policy_evaluation or {}).get("decision")
    if pr.status in ("blocked", "rejected") or decision == "blocked":
        raise AppError(409, "not_payable", "This request was blocked or rejected and cannot be paid.")
    if pr.status == "paid" or pr.payment_status in ("captured", "refunded"):
        raise AppError(409, "already_paid", "This request has already been paid.")
    if decision == "auto_approved":
        return
    if decision == "needs_approval" and pr.approval_status == "approved":
        return
    raise AppError(409, "approval_required", "This request needs an approved decision before payment.")


def ensure_authorizable(pr: PurchaseRequest) -> None:
    """Funds may be HELD (not charged) while a human decides. Blocked/rejected requests never reach PayPal."""
    decision = (pr.policy_evaluation or {}).get("decision")
    if pr.status in ("blocked", "rejected") or decision == "blocked":
        raise AppError(409, "not_payable", "This request was blocked or rejected and cannot be authorized.")
    if pr.status == "paid" or pr.payment_status in ("captured", "refunded"):
        raise AppError(409, "already_paid", "This request has already been paid.")
    if decision == "auto_approved" or (decision == "needs_approval" and pr.approval_status in ("pending", "approved")):
        return
    raise AppError(409, "approval_required", "This request cannot be authorized in its current state.")


def ensure_capturable(pr: PurchaseRequest, payment: Payment, amount: float) -> None:
    """Policy rule: capture only if the request is approved AND amount <= what is still authorized (amounts come from the DB)."""
    decision = (pr.policy_evaluation or {}).get("decision")
    if pr.status in ("blocked", "rejected") or decision == "blocked":
        raise AppError(409, "not_payable", "This request was blocked or rejected and cannot be captured.")
    if not (decision == "auto_approved" or (decision == "needs_approval" and pr.approval_status == "approved")):
        raise AppError(409, "approval_required", "Funds are held, but a human has not approved this request yet. Nothing can be captured.")
    remaining = round(payment.amount - (payment.captured_amount or 0.0), 2)
    if amount <= 0 or amount > remaining + 0.001:
        raise AppError(422, "exceeds_authorization", f"Capture amount must be between 0.01 and the {remaining:.2f} {payment.currency} still authorized.")


def _sync_transaction(db: Session, pr: PurchaseRequest, p: Payment) -> None:
    tx = db.scalar(select(Transaction).where(Transaction.purchase_request_id == pr.id))
    ra = pr.risk_assessment or {}
    if tx is None:
        tx = Transaction(user_id=pr.user_id, purchase_request_id=pr.id, merchant=pr.merchant, amount=pr.amount, currency=pr.currency,
                         risk_score=int(ra.get("score", 0)), risk_category=ra.get("category", "low"),
                         policy_decision=(pr.policy_evaluation or {}).get("decision", "needs_approval"))
        db.add(tx)
    tx.payment_status = p.status
    tx.paypal_order_id = p.paypal_order_id
    tx.data_source = p.data_source


def _apply_status(pr: PurchaseRequest, p: Payment, status: str) -> None:
    p.status = status
    pr.payment_status = status
    if status == "captured":
        pr.status = "paid"
    elif status == "failed":
        pr.status = "failed"


def create_order(db: Session, client: PayPalClient, user: User, pr: PurchaseRequest, return_url: str, cancel_url: str,
                 intent: str | None = None) -> Payment:
    if pr.user_id != user.id:
        raise AppError(404, "not_found", "Purchase request not found.")
    intent = resolve_intent(pr, intent)
    ensure_authorizable(pr) if intent == "authorize" else ensure_payable(pr)
    existing = db.scalar(select(Payment).where(Payment.purchase_request_id == pr.id, Payment.status.in_(["order_created", "buyer_approved"])))
    if existing and existing.approval_url:
        return existing  # idempotent: reuse the open order
    payment = Payment(user_id=user.id, purchase_request_id=pr.id, amount=pr.amount, currency=pr.currency, data_source=paypal_source(),
                      request_id=new_id("rid_"), intent=intent)
    order = client.create_order(amount=pr.amount, currency=pr.currency, reference_id=pr.id, description=f"{pr.item} ({pr.merchant})",
                                request_id=payment.request_id, return_url=return_url, cancel_url=cancel_url, intent=intent.upper())
    payment.paypal_order_id = order.id
    payment.approval_url = order.approval_url
    db.add(payment)
    db.flush()  # assign payment.id so the audit row links to it (timeline relies on this)
    _apply_status(pr, payment, payment_status_from_order(order.status))
    _sync_transaction(db, pr, payment)
    audit.record(db, actor=user.id, user_id=user.id, action="payment.order_created", entity_type="payment", entity_id=payment.id,
                 detail=f"PayPal order {order.id} created ({intent.upper()}) for {pr.amount:.2f} {pr.currency} at {pr.merchant}.", data_source=payment.data_source)
    db.commit()
    return payment


def capture(db: Session, client: PayPalClient, user: User, paypal_order_id: str) -> Payment:
    payment = db.scalar(select(Payment).where(Payment.paypal_order_id == paypal_order_id, Payment.user_id == user.id))
    if payment is None:
        raise AppError(404, "not_found", "No payment found for this PayPal order.")
    if payment.status in ("captured", "refunded", "partially_captured"):
        return payment  # idempotent
    if payment.status in ("voided", "failed", "expired"):
        raise AppError(409, "not_capturable", f"This payment is {payment.status} and cannot be captured.")
    if payment.intent == "authorize":
        raise AppError(409, "use_authorize_flow", "This order uses AUTHORIZE: call /payments/authorize, then capture after human approval.")
    pr = db.get(PurchaseRequest, payment.purchase_request_id)
    res = client.capture_order(paypal_order_id, request_id=f"{payment.request_id}-capture")
    if res.amount is not None and (abs(float(res.amount) - payment.amount) > 0.001 or (res.currency or "").upper() != payment.currency.upper()):
        audit.record(db, actor="system", user_id=user.id, action="payment.amount_mismatch", entity_type="payment", entity_id=payment.id,
                     detail=f"Captured {res.amount} {res.currency} but expected {payment.amount:.2f} {payment.currency}.", data_source=payment.data_source)
    status = payment_status_from_capture(res.order_status, res.capture_status)
    payment.paypal_capture_id = res.capture_id or payment.paypal_capture_id
    if status == "captured":
        payment.captured_at = utcnow()
    _apply_status(pr, payment, status)
    _sync_transaction(db, pr, payment)
    audit.record(db, actor=user.id, user_id=user.id, action=f"payment.{status}", entity_type="payment", entity_id=payment.id,
                 detail=f"PayPal order {paypal_order_id}: order {res.order_status}, capture {res.capture_status or 'n/a'} (id {res.capture_id}).", data_source=payment.data_source)
    db.commit()
    return payment


def refund(db: Session, client: PayPalClient, user: User, payment_id: str, amount: float | None = None, note: str = "") -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None or payment.user_id != user.id:
        raise AppError(404, "not_found", "Payment not found.")
    if payment.status != "captured" or not payment.paypal_capture_id:
        raise AppError(409, "not_refundable", "Only captured payments can be refunded.")
    cap_amt = payment.captured_amount or payment.amount
    if amount is not None and not (0 < amount <= cap_amt):
        raise AppError(422, "invalid_amount", "Refund amount must be between 0 and the captured amount.")
    r = client.refund_capture(payment.paypal_capture_id, request_id=f"{payment.request_id}-refund-{amount or 'full'}", amount=amount, currency=payment.currency, note=note)
    pr = db.get(PurchaseRequest, payment.purchase_request_id)
    if r.get("status") in ("COMPLETED", "PENDING") and (amount is None or abs(amount - cap_amt) < 0.001):
        _apply_status(pr, payment, "refunded")
        _sync_transaction(db, pr, payment)
    audit.record(db, actor=user.id, user_id=user.id, action="payment.refund", entity_type="payment", entity_id=payment.id,
                 detail=f"Refund {r.get('id')} status {r.get('status')} for {amount if amount is not None else cap_amt:.2f} {payment.currency}.", data_source=payment.data_source)
    db.commit()
    return payment


def void_order(db: Session, user: User, payment_id: str) -> Payment:
    """PayPal has no void for a CAPTURE-intent order that nobody approved; it simply expires. We mark it voided
    locally so it can never be captured through AgentGuard, and say so in the audit trail."""
    payment = db.get(Payment, payment_id)
    if payment is None or payment.user_id != user.id:
        raise AppError(404, "not_found", "Payment not found.")
    if payment.status not in ("order_created", "buyer_approved"):
        raise AppError(409, "not_voidable", "Only open orders can be voided.")
    pr = db.get(PurchaseRequest, payment.purchase_request_id)
    _apply_status(pr, payment, "voided")
    _sync_transaction(db, pr, payment)
    audit.record(db, actor=user.id, user_id=user.id, action="payment.voided", entity_type="payment", entity_id=payment.id,
                 detail="Order cancelled in AgentGuard; the unapproved PayPal order will expire unused.", data_source=payment.data_source)
    db.commit()
    return payment


# ---------------------------------------------------------------- Phase 1: authorize now, capture after approval
def _own_payment(db: Session, user: User, payment_id: str) -> Payment:
    p = db.get(Payment, payment_id)
    if p is None or p.user_id != user.id:
        raise AppError(404, "not_found", "Payment not found.")
    return p


def _move(db: Session, pr: PurchaseRequest, p: Payment, status: str) -> None:
    _apply_status(pr, p, status)
    _sync_transaction(db, pr, p)


def refresh_expiry(db: Session, payment: Payment) -> Payment:
    """Lazy expiry: an authorization past its expiry can never be captured. Forward-only, audited once."""
    if payment.status == "authorized" and payment.authorization_expires_at and payment.authorization_expires_at <= naive_utcnow():
        pr = db.get(PurchaseRequest, payment.purchase_request_id)
        _move(db, pr, payment, "expired")
        audit.record(db, actor="system", user_id=payment.user_id, action="payment.expired", entity_type="payment", entity_id=payment.id,
                     detail="The PayPal authorization expired; the hold was released and nothing was charged.", data_source=payment.data_source)
        db.commit()
    return payment


def authorize(db: Session, client: PayPalClient, user: User, paypal_order_id: str, gemini: GeminiClient | None = None) -> Payment:
    """After the buyer approved at PayPal: place the HOLD (Orders v2 authorize). Nothing is charged yet."""
    payment = db.scalar(select(Payment).where(Payment.paypal_order_id == paypal_order_id, Payment.user_id == user.id))
    if payment is None:
        raise AppError(404, "not_found", "No payment found for this PayPal order.")
    if payment.intent != "authorize":
        raise AppError(409, "use_capture_flow", "This order uses CAPTURE: call /payments/capture.")
    if payment.status in ("authorized", "partially_captured", "captured", "refunded"):
        return payment  # idempotent replay
    if payment.status in FINAL:
        raise AppError(409, "not_authorizable", f"This payment is {payment.status} and cannot be authorized.")
    pr = db.get(PurchaseRequest, payment.purchase_request_id)
    ensure_authorizable(pr)  # blocked / rejected requests never get a hold
    res = client.authorize_order(paypal_order_id, request_id=f"{payment.request_id}-authorize")
    if res.amount is not None and (abs(float(res.amount) - payment.amount) > 0.001 or (res.currency or "").upper() != payment.currency.upper()):
        if res.authorization_id:  # the DB amount is the truth: release a hold that does not match it
            try:
                client.void_authorization(res.authorization_id, request_id=f"{payment.request_id}-void-mismatch")
            except PayPalError:
                pass
        audit.record(db, actor="system", user_id=user.id, action="payment.amount_mismatch", entity_type="payment", entity_id=payment.id,
                     detail=f"Authorized {res.amount} {res.currency} but expected {payment.amount:.2f} {payment.currency}; hold released.", data_source=payment.data_source)
        db.commit()
        raise AppError(409, "amount_mismatch", "PayPal authorized a different amount than AgentGuard expected; the hold was released.")
    if (res.status or "").upper() != "CREATED" or not res.authorization_id:
        st = (res.status or "unknown").lower()
        audit.record(db, actor=user.id, user_id=user.id, action="payment.authorize_not_created", entity_type="payment", entity_id=payment.id,
                     detail=f"PayPal returned authorization status {st} for order {paypal_order_id}.", data_source=payment.data_source)
        db.commit()
        raise AppError(409, "authorization_not_created", f"PayPal did not create the hold (status: {st}). Try again or use another funding source.")
    payment.authorization_id = res.authorization_id
    payment.authorization_expires_at = parse_paypal_time(res.expires_at) or (naive_utcnow() + timedelta(days=AUTH_DEFAULT_DAYS))
    text, src = risk_explainer.explain_hold(payment.amount, payment.currency, pr.merchant, payment.authorization_expires_at, gemini)
    payment.hold_explanation, payment.hold_explanation_source = text, src
    _move(db, pr, payment, "authorized")
    audit.record(db, actor=user.id, user_id=user.id, action="payment.authorized", entity_type="payment", entity_id=payment.id,
                 detail=f"PayPal holds {payment.amount:.2f} {payment.currency} (authorization {res.authorization_id}); nothing charged until a human approves.", data_source=payment.data_source)
    db.commit()
    return payment


def capture_authorization(db: Session, client: PayPalClient, user: User, payment_id: str, amount: float | None = None,
                          final_capture: bool | None = None) -> Payment:
    payment = _own_payment(db, user, payment_id)
    if payment.status in ("captured", "refunded"):
        return payment  # idempotent: already fully captured
    if payment.status in FINAL:
        raise AppError(409, "not_capturable", f"This payment is {payment.status} and cannot be captured.")
    if payment.status not in HOLD_STATES or not payment.authorization_id:
        raise AppError(409, "not_authorized", "There is no PayPal hold to capture yet. Authorize the order first.")
    refresh_expiry(db, payment)
    if payment.status == "expired":
        raise AppError(409, "authorization_expired", "The PayPal hold expired. Reauthorize or create a new order.")
    pr = db.get(PurchaseRequest, payment.purchase_request_id)
    remaining = round(payment.amount - (payment.captured_amount or 0.0), 2)
    amt = round(amount if amount is not None else remaining, 2)
    ensure_capturable(pr, payment, amt)
    final = final_capture if final_capture is not None else amt >= remaining - 0.001
    rid = f"{payment.request_id}-acap-{payment.capture_count}-{money(amt)}"  # same attempt -> same id -> PayPal dedupes
    r = client.capture_authorization(payment.authorization_id, amount=amt, currency=payment.currency, request_id=rid, final_capture=final)
    st = (r.get("status") or "").upper()
    if st in ("DECLINED", "FAILED"):
        audit.record(db, actor=user.id, user_id=user.id, action="payment.capture_declined", entity_type="payment", entity_id=payment.id,
                     detail=f"PayPal {st.lower()} the capture of {amt:.2f} {payment.currency} (capture {r.get('id')}).", data_source=payment.data_source)
        db.commit()
        raise AppError(409, "capture_declined", f"PayPal {st.lower()} the capture.")
    if st == "COMPLETED":
        payment.captured_amount = round((payment.captured_amount or 0.0) + amt, 2)
        payment.capture_count += 1
        payment.paypal_capture_id = r.get("id") or payment.paypal_capture_id
        payment.captured_at = utcnow()
        _move(db, pr, payment, "captured" if final else "partially_captured")
    action = "payment.partially_captured" if (st == "COMPLETED" and not final) else "payment.captured" if st == "COMPLETED" else "payment.capture_pending"
    audit.record(db, actor=user.id, user_id=user.id, action=action, entity_type="payment", entity_id=payment.id,
                 detail=f"Captured {amt:.2f} of {payment.amount:.2f} {payment.currency} from authorization {payment.authorization_id} (capture {r.get('id')}, {st.lower() or 'n/a'}, final={final}).",
                 data_source=payment.data_source)
    db.commit()
    return payment


def void_authorization(db: Session, client: PayPalClient, user: User, payment_id: str, *, reason: str = "Voided by the buyer.") -> Payment:
    payment = _own_payment(db, user, payment_id)
    return _void_hold(db, client, payment, actor=user.id, reason=reason)


def _void_hold(db: Session, client: PayPalClient, payment: Payment, *, actor: str, reason: str) -> Payment:
    if payment.status == "voided":
        return payment  # idempotent
    if payment.status not in HOLD_STATES or not payment.authorization_id:
        raise AppError(409, "not_voidable", "Only an active PayPal hold can be voided.")
    try:
        client.void_authorization(payment.authorization_id, request_id=f"{payment.request_id}-void")
    except PayPalError as e:
        if e.upstream_status in (400, 404, 409, 422):  # maybe it was already voided at PayPal: trust PayPal's own state
            if (client.get_authorization(payment.authorization_id).get("status") or "").upper() != "VOIDED":
                raise
        else:
            raise
    pr = db.get(PurchaseRequest, payment.purchase_request_id)
    partial = (payment.captured_amount or 0) > 0
    _move(db, pr, payment, "captured" if partial else "voided")  # a partly captured hold: the remainder is released
    audit.record(db, actor=actor, user_id=payment.user_id, action="payment.remainder_released" if partial else "payment.voided", entity_type="payment",
                 entity_id=payment.id, detail=f"{reason} PayPal released the hold ({payment.authorization_id}); nothing further will be charged.", data_source=payment.data_source)
    db.commit()
    return payment


def release_hold_on_rejection(db: Session, client: PayPalClient, user: User, pr: PurchaseRequest) -> Payment | None:
    """A human rejected the request: void any funds hold automatically. A PayPal failure is audited and never blocks the rejection."""
    p = db.scalar(select(Payment).where(Payment.purchase_request_id == pr.id, Payment.status.in_(HOLD_STATES)))
    if p is None:
        return None
    try:
        return _void_hold(db, client, p, actor=user.id, reason="Request rejected by a human.")
    except AppError as e:
        audit.record(db, actor="system", user_id=user.id, action="payment.void_failed", entity_type="payment", entity_id=p.id,
                     detail=f"Auto-void after rejection failed ({e.message}). Void it manually from the Approval centre.", data_source=p.data_source)
        db.commit()
        return p


def reauthorize(db: Session, client: PayPalClient, user: User, payment_id: str) -> Payment:
    payment = _own_payment(db, user, payment_id)
    refresh_expiry(db, payment)
    if payment.status != "authorized" or (payment.captured_amount or 0) > 0 or not payment.authorization_id:
        raise AppError(409, "not_reauthorizable", "Only an active hold with nothing captured can be reauthorized.")
    pr = db.get(PurchaseRequest, payment.purchase_request_id)
    ensure_authorizable(pr)
    r = client.reauthorize(payment.authorization_id, amount=payment.amount, currency=payment.currency, request_id=f"{payment.request_id}-reauth-{payment.reauth_count}")
    payment.authorization_id = r.get("id") or payment.authorization_id
    payment.reauth_count += 1
    exp = None
    try:
        exp = parse_paypal_time(client.get_authorization(payment.authorization_id).get("expiration_time"))
    except PayPalError:
        pass
    payment.authorization_expires_at = exp or (naive_utcnow() + timedelta(days=AUTH_DEFAULT_DAYS))
    audit.record(db, actor=user.id, user_id=user.id, action="payment.reauthorized", entity_type="payment", entity_id=payment.id,
                 detail=f"Hold renewed (authorization {payment.authorization_id}); expiry {'from PayPal' if exp else 'estimated'}.", data_source=payment.data_source)
    db.commit()
    return payment


# ---------------------------------------------------------------- webhooks
def apply_webhook_event(db: Session, event: dict) -> bool:
    """Update payment state from a VERIFIED webhook event. Idempotent by event id; the state machine only moves forward."""
    event_id, etype, res = event.get("id", ""), event.get("event_type", ""), event.get("resource") or {}
    new_status = status_from_webhook_event(etype)
    if not new_status:
        return False
    if event_id and db.scalar(select(AuditLog.id).where(AuditLog.action == "paypal.webhook", AuditLog.entity_id == event_id)):
        return True  # duplicate delivery
    related = (res.get("supplementary_data") or {}).get("related_ids") or {}
    order_id = related.get("order_id") if etype.startswith("PAYMENT.") else res.get("id")
    payment = None
    if etype.startswith("PAYMENT.AUTHORIZATION") and res.get("id"):
        payment = db.scalar(select(Payment).where(Payment.authorization_id == res["id"]))
    if payment is None and order_id:
        payment = db.scalar(select(Payment).where(Payment.paypal_order_id == order_id))
    if payment is None:
        return False
    pr = db.get(PurchaseRequest, payment.purchase_request_id)
    if etype == "PAYMENT.CAPTURE.COMPLETED" and payment.intent == "authorize":
        if payment.status in ("order_created", "buyer_approved", "authorized"):  # webhook beat our API response
            amt = float((res.get("amount") or {}).get("value") or payment.amount)
            payment.captured_amount = round(amt, 2)
            payment.capture_count = max(payment.capture_count, 1)
            new_status = "captured" if amt >= payment.amount - 0.001 else "partially_captured"
        else:
            new_status = payment.status  # already partially/fully captured by our own call: no-op
    if can_transition(payment.status, new_status):
        if new_status == "captured" and payment.intent != "authorize":
            payment.captured_amount = payment.captured_amount or payment.amount
        if new_status in ("captured", "partially_captured"):
            payment.paypal_capture_id = res.get("id") or payment.paypal_capture_id
            payment.captured_at = payment.captured_at or utcnow()
        if new_status == "authorized":
            payment.authorization_id = res.get("id") or payment.authorization_id
            payment.authorization_expires_at = parse_paypal_time(res.get("expiration_time")) or payment.authorization_expires_at
        _move(db, pr, payment, new_status)
    from app.services import timeline  # local import: timeline imports models only, but keep payments importable on its own
    timeline.record_webhook_event(db, payment, event)  # verified upstream by the webhook route; idempotent by PayPal event id
    audit.record(db, actor="paypal:webhook", user_id=payment.user_id, action="paypal.webhook", entity_type="payment", entity_id=event_id or payment.id,
                 detail=f"{etype} for order {payment.paypal_order_id} -> {payment.status}.", data_source=payment.data_source)
    db.commit()
    return True
