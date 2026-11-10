from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.util import iso, naive_utcnow
from app.database.session import get_db
from app.models import AuditLog, PurchaseRequest, Transaction, User
from app.services.seed import default_policy_for

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    txs = db.scalars(select(Transaction).where(Transaction.user_id == user.id)).all()
    prs = {p.id: p for p in db.scalars(select(PurchaseRequest).where(PurchaseRequest.user_id == user.id))}

    def bucket(t: Transaction) -> str:
        pr = prs.get(t.purchase_request_id or "")
        if t.policy_decision == "blocked" or (pr and pr.status == "rejected"):
            return "blocked"
        if t.policy_decision == "needs_approval" and pr and pr.approval_status == "pending":
            return "pending"
        return "approved"

    counts = {"approved": 0, "blocked": 0, "pending": 0}
    dist = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for t in txs:
        counts[bucket(t)] += 1
        dist[t.risk_category] = dist.get(t.risk_category, 0) + 1
    now = naive_utcnow()
    day0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    policy = default_policy_for(user.id, db)
    committed = sum(p.amount for p in prs.values() if p.status in ("approved", "paid") and p.created_at >= day0 and p.currency == "USD")
    history = []
    for i in range(13, -1, -1):
        d0 = day0 - timedelta(days=i); d1 = d0 + timedelta(days=1)
        day = [t for t in txs if d0 <= t.created_at < d1]
        history.append({"date": d0.date().isoformat(), "approved": sum(1 for t in day if bucket(t) == "approved"), "blocked": sum(1 for t in day if bucket(t) == "blocked"),
                        "volume": round(sum(t.amount for t in day if t.payment_status == "captured" and t.currency == "USD"), 2)})
    logs = db.scalars(select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()).limit(8)).all()
    return {
        "total_volume": round(sum(t.amount for t in txs if t.payment_status == "captured" and t.currency == "USD"), 2), "currency": "USD",
        "approved_count": counts["approved"], "blocked_count": counts["blocked"], "pending_count": counts["pending"],
        "high_risk_count": dist["high"] + dist["critical"],
        "daily_utilization_pct": round(min(100.0, committed / policy.daily_limit * 100), 1) if policy.daily_limit else 0.0,
        "risk_distribution": dist, "history": history,
        "activity": [{"id": a.id, "message": a.detail or a.action, "created_at": iso(a.created_at)} for a in logs], "data_source": "backend",
    }
