"""Rule-based risk scoring (0-100). Pure and deterministic. AI may explain it, never change it."""
from app.policies.engine import norm
from app.policies.injection import find_injection
from app.policies.types import AUTO, BLOCKED, NEEDS, MerchantInfo, PolicyConfig, PolicyResult, PurchaseInput, RiskFactorItem, RiskResult, SpendHistory

RISKY_CATEGORIES = {"gift cards", "luxury goods", "crypto", "gambling", "wire transfer", "prepaid cards"}


def category_for(score: int) -> str:
    if score < 25:
        return "low"
    if score < 50:
        return "medium"
    if score < 75:
        return "high"
    return "critical"


def assess_risk(purchase: PurchaseInput, policy: PolicyConfig, merchant: MerchantInfo | None, history: SpendHistory,
                policy_result: PolicyResult | None = None) -> RiskResult:
    f: list[RiskFactorItem] = []
    amt = purchase.amount

    def add(code: str, label: str, weight: int, detail: str) -> None:
        f.append(RiskFactorItem(code, label, weight, detail))

    rules = {x.rule for x in (policy_result.violations if policy_result else [])}

    if merchant is None:
        add("unknown_merchant", "Unknown merchant", 25, f"{purchase.merchant} has no record in the merchant directory.")
    elif merchant.status == "restricted":
        add("restricted_merchant", "Restricted merchant", 60, f"{merchant.name} is restricted (trust score {merchant.trust_score}).")
    elif merchant.status == "unreviewed":
        add("unreviewed_merchant", "Unreviewed merchant", 20, f"{merchant.name} has not been reviewed (trust score {merchant.trust_score}).")
    elif merchant.trust_score < 70:
        add("low_trust_merchant", "Low merchant trust", 10, f"Trust score is {merchant.trust_score}/100.")
    if merchant is not None and merchant.category.casefold() in RISKY_CATEGORIES:
        add("risky_category", "High-risk category", 15, f"Category '{merchant.category}' is commonly abused.")

    if policy.max_transaction_amount > 0:
        ratio = amt / policy.max_transaction_amount
        if ratio > 1:
            add("over_transaction_limit", "Over per-transaction limit", 25, f"{amt:.2f} is {ratio:.1f}x the {policy.max_transaction_amount:.2f} limit.")
        elif ratio >= 0.8:
            add("near_transaction_limit", "Near per-transaction limit", 20, f"{ratio:.0%} of the per-transaction limit.")
        elif ratio >= 0.5:
            add("large_amount", "Large amount", 10, f"{ratio:.0%} of the per-transaction limit.")

    if policy.daily_limit > 0:
        util = (history.spent_today + amt) / policy.daily_limit
        if util > 1:
            add("over_daily_limit", "Over daily limit", 25, f"Daily spend would be {util:.0%} of the limit.")
        elif util >= 0.8:
            add("high_daily_utilization", "High daily utilization", 15, f"Daily spend would be {util:.0%} of the limit.")
        elif util >= 0.5:
            add("moderate_daily_utilization", "Moderate daily utilization", 8, f"Daily spend would be {util:.0%} of the limit.")

    if history.duplicates_in_window > 0:
        add("possible_duplicate", "Possible duplicate", 20, "A matching purchase happened recently.")
    if purchase.currency.upper() not in {c.upper() for c in policy.allowed_currencies}:
        add("currency_not_allowed", "Disallowed currency", 15, f"{purchase.currency.upper()} is not in the allowed list.")
    inj = find_injection(purchase.item, purchase.merchant, purchase.description, purchase.reason)
    if inj:
        add("prompt_injection", "Instruction-like text", 40, "Item/merchant text contains instructions aimed at the system.")
    if purchase.priority == "urgent":
        add("urgency_pressure", "Urgent priority", 5, "Urgency is a common social-engineering lever.")
    if len(purchase.reason.strip()) < 5:
        add("no_reason", "No business reason", 5, "The agent gave no meaningful reason.")
    if "merchant_not_approved" in rules and not any(x.code in {"unknown_merchant", "unreviewed_merchant", "restricted_merchant"} for x in f):
        add("not_on_approved_list", "Not on approved list", 8, "Merchant is known but not on the approved list.")

    score = min(100, sum(x.weight for x in f))
    return RiskResult(score=score, category=category_for(score), factors=f)


def final_decision(policy_result: PolicyResult, risk: RiskResult) -> str:
    """Policy decision, escalated (never relaxed) by risk. Blocks always win."""
    if policy_result.decision == BLOCKED:
        return BLOCKED
    if policy_result.decision == AUTO and risk.category in {"high", "critical"}:
        return NEEDS
    return policy_result.decision
