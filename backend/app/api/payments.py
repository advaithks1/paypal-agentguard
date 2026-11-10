import json

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.errors import AppError
from app.database.session import get_db
from app.agents.gemini import GeminiClient, get_gemini_client
from app.integrations.paypal import PayPalClient, get_paypal_client, payment_status_from_order
from app.models import Payment, PurchaseRequest, User
from app.services import payments as svc
from app.services.serializers import payment_out

router = APIRouter(prefix="/payments", tags=["payments"])


class CreateOrder(BaseModel):
    purchase_request_id: str
    intent: str | None = Field(default=None, pattern="^(authorize|capture|auto)$")


class CaptureAuthBody(BaseModel):
    amount: float | None = Field(default=None, gt=0)  # partial capture; omit for the full remaining amount
    final_capture: bool | None = None


class CaptureBody(BaseModel):
    paypal_order_id: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class RefundBody(BaseModel):
    amount: float | None = Field(default=None, gt=0)


@router.post("/create-order", status_code=201)
def create_order(body: CreateOrder, user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    pr = db.get(PurchaseRequest, body.purchase_request_id)
    if pr is None or pr.user_id != user.id:
        raise AppError(404, "not_found", "Purchase request not found.")
    origin = get_settings().frontend_origin.rstrip("/")
    return payment_out(svc.create_order(db, client, user, pr, f"{origin}/paypal/return", f"{origin}/paypal/cancel", body.intent))


@router.post("/capture")
def capture(body: CaptureBody, user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    return payment_out(svc.capture(db, client, user, body.paypal_order_id))


@router.post("/authorize")
def authorize(body: CaptureBody, user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client),
              gemini: GeminiClient = Depends(get_gemini_client)) -> dict:
    """After the buyer approved at PayPal: hold the funds (AUTHORIZE). Nothing is charged."""
    return payment_out(svc.authorize(db, client, user, body.paypal_order_id, gemini))


@router.post("/{payment_id}/capture-authorization")
def capture_authorization(payment_id: str, body: CaptureAuthBody, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                          client: PayPalClient = Depends(get_paypal_client)) -> dict:
    return payment_out(svc.capture_authorization(db, client, user, payment_id, body.amount, body.final_capture))


@router.post("/{payment_id}/void-authorization")
def void_authorization(payment_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    return payment_out(svc.void_authorization(db, client, user, payment_id))


@router.post("/{payment_id}/reauthorize")
def reauthorize(payment_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    return payment_out(svc.reauthorize(db, client, user, payment_id))


@router.post("/{payment_id}/refund")
def refund(payment_id: str, body: RefundBody, user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    return payment_out(svc.refund(db, client, user, payment_id, body.amount))


@router.post("/{payment_id}/void")
def void(payment_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return payment_out(svc.void_order(db, user, payment_id))


@router.get("/by-request/{pr_id}")
def by_request(pr_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict | None:
    p = db.query(Payment).filter(Payment.purchase_request_id == pr_id, Payment.user_id == user.id).order_by(Payment.created_at.desc()).first()
    return payment_out(svc.refresh_expiry(db, p)) if p else None


@router.get("/{payment_id}/sync")
def sync(payment_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    """Polling fallback when webhooks are not configured: read the real order state from PayPal (forward-only)."""
    p = db.get(Payment, payment_id)
    if p is None or p.user_id != user.id or not p.paypal_order_id:
        raise AppError(404, "not_found", "Payment not found.")
    order = client.get_order(p.paypal_order_id)
    new = payment_status_from_order(order.get("status"))
    if p.status in ("order_created",) and new == "buyer_approved":
        pr = db.get(PurchaseRequest, p.purchase_request_id)
        svc._apply_status(pr, p, new)
        svc._sync_transaction(db, pr, p)
        db.commit()
    return payment_out(p)


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    """Public endpoint called by PayPal. The signature is verified with PayPal before anything is applied."""
    raw = await request.body()
    try:
        event = json.loads(raw)
    except ValueError:
        raise AppError(400, "bad_request", "Body must be JSON.")
    if not isinstance(event, dict) or not client.verify_webhook(dict(request.headers), event):
        raise AppError(400, "invalid_signature", "Webhook signature could not be verified.")
    return {"handled": svc.apply_webhook_event(db, event)}
