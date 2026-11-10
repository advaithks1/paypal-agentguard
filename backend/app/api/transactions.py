from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import AppError
from pydantic import BaseModel

from app.agents import narrator
from app.agents.gemini import GeminiClient, get_gemini_client
from app.core.config import get_settings
from app.core.util import iso, utcnow
from app.database.session import get_db
from app.models import AuditLog, Merchant, Payment, PurchaseRequest, Transaction, User
from app.services import timeline as tl
from app.services.serializers import tx_out

router = APIRouter(prefix="/transactions", tags=["transactions"])
SORTS = {"created_at": Transaction.created_at, "amount": Transaction.amount, "risk_score": Transaction.risk_score, "merchant": Transaction.merchant}
LABELS = {
    "purchase_request.created": "Request submitted", "policy.auto_approved": "Policy: auto-approved", "policy.needs_approval": "Policy: needs approval",
    "policy.blocked": "Policy: blocked", "approval.approved": "Human approved", "approval.rejected": "Human rejected",
    "payment.order_created": "PayPal order created", "payment.captured": "Payment captured", "payment.failed": "Payment failed",
    "payment.refund": "Refund issued", "payment.voided": "Order voided", "paypal.webhook": "PayPal webhook received",
}


@router.get("")
def list_transactions(search: str | None = None, policy_decision: str | None = None, payment_status: str | None = None, risk_category: str | None = None,
                      sort_by: str = "created_at", sort_dir: str = "desc", page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    q = select(Transaction).where(Transaction.user_id == user.id)
    if search:
        like = f"%{search.strip().lower()}%"
        q = q.where(or_(func.lower(Transaction.id).like(like), func.lower(Transaction.merchant).like(like)))
    for col, val in ((Transaction.policy_decision, policy_decision), (Transaction.payment_status, payment_status), (Transaction.risk_category, risk_category)):
        if val:
            q = q.where(col == val)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    col = SORTS.get(sort_by, Transaction.created_at)
    q = q.order_by(col.asc() if sort_dir == "asc" else col.desc(), Transaction.id).offset((page - 1) * page_size).limit(page_size)
    return {"items": [tx_out(t) for t in db.scalars(q)], "total": total, "page": page, "page_size": page_size}


@router.get("/{tx_id}")
def get_transaction(tx_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    t = db.get(Transaction, tx_id)
    if t is None or t.user_id != user.id:
        raise AppError(404, "not_found", "Transaction not found.")
    pr = db.get(PurchaseRequest, t.purchase_request_id) if t.purchase_request_id else None
    m = db.scalar(select(Merchant).where(func.lower(Merchant.name) == t.merchant.casefold()))
    ids = [pr.id] if pr else []
    if pr:
        ids += [pid for (pid,) in db.execute(select(Payment.id).where(Payment.purchase_request_id == pr.id))]
    logs = db.scalars(select(AuditLog).where(AuditLog.entity_id.in_(ids), AuditLog.user_id == user.id).order_by(AuditLog.created_at)).all() if ids else []
    timeline = [{"label": LABELS.get(a.action, a.action), "at": iso(a.created_at)} for a in logs]
    return {**tx_out(t), "merchant_trust_score": m.trust_score if m else None, "policy_evaluation": pr.policy_evaluation if pr else None,
            "risk_assessment": pr.risk_assessment if pr else None, "timeline": timeline}


def _own_tx(db: Session, user: User, tx_id: str) -> Transaction:
    t = db.get(Transaction, tx_id)
    if t is None or t.user_id != user.id:
        raise AppError(404, "not_found", "Transaction not found.")
    return t


def _timeline_out(db: Session, t: Transaction) -> dict:
    pr = db.get(PurchaseRequest, t.purchase_request_id) if t.purchase_request_id else None
    return {"transaction_id": t.id, "payment_status": t.payment_status, "live": tl.is_live(t, pr), "events": tl.build_timeline(db, t),
            "sandbox": "sandbox" in get_settings().paypal_base_url, "generated_at": iso(utcnow())}


@router.get("/{tx_id}/timeline")
def transaction_timeline(tx_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Merged timeline (AgentGuard, Agent via MCP, PayPal webhook). The UI polls this every 3 seconds while `live` is true."""
    return _timeline_out(db, _own_tx(db, user, tx_id))


@router.post("/{tx_id}/narrate")
def narrate_transaction(tx_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db), gemini: GeminiClient = Depends(get_gemini_client)) -> dict:
    t = _own_tx(db, user, tx_id)
    events = tl.build_timeline(db, t)
    text, src = narrator.narrate(events, t.merchant, t.amount, t.currency, t.payment_status, gemini)
    return {"narration": text, "source": src, "source_label": "Gemini" if src == "gemini" else "rules"}


class SimulateBody(BaseModel):
    event_type: str


@router.post("/{tx_id}/simulate-webhook")
def simulate_webhook(tx_id: str, body: SimulateBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Sandbox demo helper. Adds a clearly labelled, UNVERIFIED event to the timeline only; it never changes payment state."""
    if "sandbox" not in get_settings().paypal_base_url:
        raise AppError(403, "sandbox_only", "The webhook simulator is only available against the PayPal Sandbox.")
    t = _own_tx(db, user, tx_id)
    tl.simulate_event(db, t, body.event_type)
    return _timeline_out(db, t)
