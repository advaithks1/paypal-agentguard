from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.database.session import get_db
from app.integrations.paypal import PayPalClient, get_paypal_client
from app.models import PurchaseRequest, User
from app.services import wallet as svc
from app.services.serializers import payment_out

router = APIRouter(prefix="/wallet", tags=["agent-wallet"])


class CompleteBody(BaseModel):
    setup_token_id: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class GuardrailBody(BaseModel):
    daily_cap: float = Field(gt=0, le=100_000)
    per_transaction_cap: float = Field(gt=0, le=100_000)
    allowed_merchants: list[str] = Field(default_factory=list, max_length=50)
    agent_name: str = Field(default="*", min_length=1, max_length=80)


def _full(db: Session, user: User) -> dict:
    charges = []
    for p in svc.recent_charges(db, user.id):
        pr = db.get(PurchaseRequest, p.purchase_request_id)
        charges.append({**payment_out(p), "agent_name": p.agent_name, "autonomous": True, "item": pr.item if pr else "", "merchant": pr.merchant if pr else "", "created_at": p.created_at.isoformat() + "Z"})
    return {**svc.wallet_state(db, user), "recent_charges": charges}


@router.get("")
def get_wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return _full(db, user)


@router.post("/connect")
def connect(user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    origin = get_settings().frontend_origin.rstrip("/")
    return svc.connect_start(db, client, user, f"{origin}/wallet/return", f"{origin}/wallet")


@router.post("/complete")
def complete(body: CompleteBody, user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    svc.connect_complete(db, client, user, body.setup_token_id)
    return _full(db, user)


@router.post("/revoke")
def revoke(user: User = Depends(get_current_user), db: Session = Depends(get_db), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    svc.revoke(db, client, user)
    return _full(db, user)


@router.put("/guardrails")
def guardrails(body: GuardrailBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    svc.update_guardrail(db, user, body.daily_cap, body.per_transaction_cap, body.allowed_merchants, body.agent_name)
    return _full(db, user)
