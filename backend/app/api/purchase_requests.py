from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.gemini import GeminiClient, get_gemini_client
from app.api.deps import get_current_user
from app.core.errors import AppError
from app.database.session import get_db
from app.integrations.paypal import PayPalClient, get_paypal_client
from app.models import Approval, PurchaseRequest, User
from app.schemas.purchase import DecisionRequest, PurchaseRequestCreate
from app.services import requests as svc
from app.services import wallet as wallet_svc
from app.services.serializers import approval_out, pr_out

router = APIRouter(tags=["purchase-requests"])


@router.post("/purchase-requests", status_code=201)
def create_request(body: PurchaseRequestCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                   gemini: GeminiClient = Depends(get_gemini_client), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    pr = svc.create_purchase_request(db, user, body, gemini, agent_name=None)
    if body.use_agent_wallet:
        wallet_svc.try_autonomous_charge(db, client, user, pr)
    return pr_out(pr)


@router.get("/purchase-requests")
def list_requests(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    q = select(PurchaseRequest).where(PurchaseRequest.user_id == user.id)
    if status:
        q = q.where(PurchaseRequest.status == status)
    rows = db.scalars(q.order_by(PurchaseRequest.created_at.desc())).all()
    start = (page - 1) * page_size
    return {"items": [pr_out(r) for r in rows[start:start + page_size]], "total": len(rows), "page": page, "page_size": page_size}


@router.get("/purchase-requests/{pr_id}")
def get_request(pr_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    pr = db.get(PurchaseRequest, pr_id)
    if pr is None or pr.user_id != user.id:
        raise AppError(404, "not_found", "Purchase request not found.")
    return pr_out(pr)


@router.get("/approvals")
def list_approvals(status: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    q = select(Approval).where(Approval.user_id == user.id)
    if status:
        q = q.where(Approval.status == status)
    return [approval_out(a) for a in db.scalars(q.order_by(Approval.created_at.desc()))]


@router.post("/approvals/{approval_id}/decide")
def decide(approval_id: str, body: DecisionRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
           client: PayPalClient = Depends(get_paypal_client)) -> dict:
    return approval_out(svc.decide_approval(db, user, approval_id, body.decision, body.note, paypal=client))
