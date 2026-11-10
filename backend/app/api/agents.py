from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models import User
from app.services import agents as svc
from app.services import wallet as wallet_svc

router = APIRouter(prefix="/agents", tags=["agents"])


class CreateAgentBody(BaseModel):
    name: str = Field(min_length=2, max_length=60, pattern=r"^[A-Za-z0-9][A-Za-z0-9 _.-]*$")
    daily_cap: float | None = Field(default=None, gt=0, le=100_000)
    per_transaction_cap: float | None = Field(default=None, gt=0, le=100_000)
    allowed_merchants: list[str] = Field(default_factory=list, max_length=50)


@router.get("")
def list_agents(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    return svc.list_agents(db, user)


@router.post("", status_code=201)
def create_agent(body: CreateAgentBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    a, key = svc.create_agent(db, user, body.name)
    if body.daily_cap is not None or body.per_transaction_cap is not None:
        g = wallet_svc.get_guardrail(db, user.id, None)  # start from the all-agents defaults
        wallet_svc.update_guardrail(db, user, body.daily_cap or g.daily_cap, body.per_transaction_cap or g.per_transaction_cap, body.allowed_merchants, a.name)
    return {"agent": svc.agent_out(db, a), "api_key": key, "note": "Copy this key now. It is shown once and cannot be recovered."}


@router.post("/{agent_id}/revoke")
def revoke_agent(agent_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return svc.agent_out(db, svc.revoke_agent(db, user, agent_id))


@router.get("/{agent_id}/activity")
def activity(agent_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return svc.agent_activity(db, user, agent_id)
