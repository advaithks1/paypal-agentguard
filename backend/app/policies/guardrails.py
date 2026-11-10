"""Deterministic agent-wallet guardrails. Pure function: no I/O, no AI. Runs BEFORE any vault charge."""
from dataclasses import dataclass

from app.policies.types import Violation


@dataclass(frozen=True)
class Guardrail:
    daily_cap: float
    per_transaction_cap: float
    allowed_merchants: tuple[str, ...] = ()


def check_guardrails(amount: float, merchant: str, g: Guardrail, spent_today: float) -> list[Violation]:
    """Empty list = the agent may charge the vault without a human. Any item = fall back to human approval."""
    out: list[Violation] = []
    if amount > g.per_transaction_cap + 1e-9:
        out.append(Violation("agent_per_transaction_cap", f"{amount:.2f} exceeds the agent's per-transaction cap of {g.per_transaction_cap:.2f}.", "warning"))
    if spent_today + amount > g.daily_cap + 1e-9:
        out.append(Violation("agent_daily_cap", f"Agent spending today ({spent_today:.2f}) plus {amount:.2f} would pass the daily cap of {g.daily_cap:.2f}.", "warning"))
    allowed = {m.casefold() for m in g.allowed_merchants}
    if allowed and " ".join(merchant.split()).casefold() not in allowed:
        out.append(Violation("agent_merchant_not_allowed", f"{merchant} is not on this agent's allowed merchant list.", "warning"))
    return out
