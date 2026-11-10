"""Deterministic policy engine. Pure function: same inputs always give the same decision."""
from datetime import datetime, timezone

from app.policies.injection import find_injection
from app.policies.types import (
    AUTO, BLOCKED, NEEDS, MerchantInfo, PolicyConfig, PolicyResult, PurchaseInput, SpendHistory, Violation,
)


def norm(name: str) -> str:
    return " ".join(name.casefold().split())


def _in(name: str, names: tuple[str, ...]) -> bool:
    n = norm(name)
    return any(norm(x) == n for x in names)  # exact match only: "Amazon" never matches "Amazon Web Services"


def evaluate_policy(
    purchase: PurchaseInput,
    policy: PolicyConfig,
    merchant: MerchantInfo | None,
    history: SpendHistory,
    now: datetime | None = None,
) -> PolicyResult:
    v: list[Violation] = []
    cur = purchase.currency.upper()
    amt = purchase.amount

    if not (amt > 0) or amt != amt or amt == float("inf"):
        v.append(Violation("invalid_amount", "Amount must be a positive number.", "blocking"))

    inj = find_injection(purchase.item, purchase.merchant, purchase.description, purchase.reason)
    if inj:
        v.append(Violation("untrusted_instruction", f"Text tries to instruct the system ({inj[0]!r}). Treated as data and blocked.", "blocking"))

    if cur not in {c.upper() for c in policy.allowed_currencies}:
        v.append(Violation("currency_not_allowed", f"{cur} is not an allowed currency.", "blocking"))

    restricted = _in(purchase.merchant, policy.restricted_merchants) or (merchant is not None and merchant.status == "restricted")
    if restricted:
        v.append(Violation("merchant_restricted", f"{purchase.merchant} is a restricted merchant.", "blocking"))

    if amt > policy.max_transaction_amount:
        v.append(Violation("max_transaction_exceeded", f"{amt:.2f} exceeds the per-transaction maximum of {policy.max_transaction_amount:.2f}.", "blocking"))

    if merchant is not None and merchant.per_transaction_limit is not None and amt > merchant.per_transaction_limit and not restricted:
        v.append(Violation("merchant_limit_exceeded", f"{amt:.2f} exceeds {merchant.name}'s per-transaction limit of {merchant.per_transaction_limit:.2f}.", "blocking"))

    if merchant is not None and merchant.monthly_limit is not None and not restricted and history.spent_month_at_merchant + amt > merchant.monthly_limit:
        v.append(Violation("merchant_monthly_limit_exceeded", f"This would exceed {merchant.name}'s monthly limit of {merchant.monthly_limit:.2f}.", "blocking"))

    if history.spent_today + amt > policy.daily_limit:
        v.append(Violation("daily_limit_exceeded", f"Today's spend would reach {history.spent_today + amt:.2f}, over the daily limit of {policy.daily_limit:.2f}.", "blocking"))

    # Warnings: a human must look, but the purchase is not forbidden.
    if not restricted and not _in(purchase.merchant, policy.approved_merchants):
        v.append(Violation("merchant_not_approved", f"{purchase.merchant} is not on the approved merchant list.", "warning"))

    if policy.duplicate_protection and history.duplicates_in_window > 0:
        v.append(Violation("possible_duplicate", f"A matching purchase was made in the last {policy.duplicate_window_minutes} minutes.", "warning"))

    if amt > policy.max_auto_amount or amt >= policy.manual_approval_threshold:
        v.append(Violation("manual_approval_required", f"Amounts above {min(policy.max_auto_amount, policy.manual_approval_threshold):.2f} need a human approval.", "warning"))

    if any(x.severity == "blocking" for x in v):
        decision = BLOCKED
    elif any(x.severity == "warning" for x in v):
        decision = NEEDS
    else:
        decision = AUTO
    return PolicyResult(decision=decision, violations=v, evaluated_at=now or datetime.now(timezone.utc))
