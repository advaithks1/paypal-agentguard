from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models import AuditLog, Merchant, User
from app.services.serializers import audit_out, merchant_out

router = APIRouter(tags=["lists"])


@router.get("/merchants")
def merchants(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    return [merchant_out(m) for m in db.scalars(select(Merchant).order_by(Merchant.status, Merchant.name))]


@router.get("/audit-logs")
def audit_logs(action: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
               user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    q = select(AuditLog).where(AuditLog.user_id == user.id)
    if action:
        q = q.where(AuditLog.action.like(f"{action}%"))
    rows = db.scalars(q.order_by(AuditLog.created_at.desc(), AuditLog.id)).all()
    s = (page - 1) * page_size
    return {"items": [audit_out(r) for r in rows[s:s + page_size]], "total": len(rows), "page": page, "page_size": page_size}
