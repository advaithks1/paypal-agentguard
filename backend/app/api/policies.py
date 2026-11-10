from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import policy_copilot
from app.agents.gemini import GeminiClient, get_gemini_client
from app.api.deps import get_current_user
from app.core.errors import AppError
from app.core.util import naive_utcnow
from app.database.session import get_db
from app.models import Merchant, User
from app.schemas.policy import POLICY_FIELDS, CopilotRequest, PolicyUpdate
from app.services import audit
from app.services.seed import default_policy_for
from app.services.serializers import policy_out

router = APIRouter(prefix="/policies", tags=["policies"])


def _clean(names: list[str]) -> list[str]:
    seen, out = set(), []
    for n in names:
        n = " ".join(n.split())
        if n and n.casefold() not in seen:
            seen.add(n.casefold()); out.append(n)
    return out


@router.get("")
def get_policy(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return policy_out(default_policy_for(user.id, db))


@router.put("")
def update_policy(body: PolicyUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    if body.max_auto_amount > body.max_transaction_amount:
        raise AppError(422, "invalid_policy", "The auto-approve amount cannot exceed the per-transaction maximum.")
    approved, restricted = _clean(body.approved_merchants), _clean(body.restricted_merchants)
    if {a.casefold() for a in approved} & {r.casefold() for r in restricted}:
        raise AppError(422, "invalid_policy", "A merchant cannot be both approved and restricted.")
    p = default_policy_for(user.id, db)
    before = policy_out(p)
    for f in POLICY_FIELDS:
        setattr(p, f, getattr(body, f))
    p.approved_merchants, p.restricted_merchants = approved, restricted
    p.updated_at = naive_utcnow()
    changed = [f for f in POLICY_FIELDS if before[f] != getattr(p, f)]
    audit.record(db, actor=user.id, user_id=user.id, action="policy.updated", entity_type="policy", entity_id=p.id,
                 detail="Changed: " + (", ".join(changed) or "nothing") + ".")
    db.commit()
    return policy_out(p)


@router.post("/copilot")
def copilot(body: CopilotRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
            gemini: GeminiClient = Depends(get_gemini_client)) -> dict:
    """Returns a PROPOSAL only. The user must confirm it by calling PUT /policies with `proposed_policy`."""
    current = policy_out(default_policy_for(user.id, db))
    directory = [n for (n,) in db.execute(select(Merchant.name).order_by(Merchant.name))]
    proposal = policy_copilot.propose(body.instruction, current, directory, gemini)
    proposal["proposed_policy"] = {f: proposal["changes"].get(f, current[f]) for f in POLICY_FIELDS}
    audit.record(db, actor=f"agent:policy-copilot", user_id=user.id, action="policy.copilot_proposed", entity_type="policy",
                 detail=f"Proposed ({proposal['source']}): {proposal['summary']}")
    db.commit()
    return proposal
