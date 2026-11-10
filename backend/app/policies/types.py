"""Plain data types for the deterministic engine. No I/O, no ORM, no AI."""
from dataclasses import dataclass, field
from datetime import datetime

AUTO = "auto_approved"
NEEDS = "needs_approval"
BLOCKED = "blocked"


@dataclass(frozen=True)
class PolicyConfig:
    max_auto_amount: float = 50.0
    max_transaction_amount: float = 300.0
    daily_limit: float = 500.0
    manual_approval_threshold: float = 50.0
    allowed_currencies: tuple[str, ...] = ("USD",)
    approved_merchants: tuple[str, ...] = ()
    restricted_merchants: tuple[str, ...] = ()
    duplicate_protection: bool = True
    duplicate_window_minutes: int = 60


@dataclass(frozen=True)
class PurchaseInput:
    item: str
    merchant: str
    amount: float
    currency: str = "USD"
    description: str = ""
    reason: str = ""
    priority: str = "normal"


@dataclass(frozen=True)
class MerchantInfo:
    name: str
    status: str  # trusted | restricted | unreviewed
    trust_score: int
    category: str = ""
    per_transaction_limit: float | None = None
    monthly_limit: float | None = None


@dataclass(frozen=True)
class SpendHistory:
    """Facts the caller computed from the database. The engine never queries anything."""
    spent_today: float = 0.0               # committed spend today, same currency as the purchase
    spent_month_at_merchant: float = 0.0
    duplicates_in_window: int = 0          # same merchant + amount + currency within the window


@dataclass(frozen=True)
class Violation:
    rule: str
    message: str
    severity: str  # info | warning | blocking

    def to_dict(self) -> dict:
        return {"rule": self.rule, "message": self.message, "severity": self.severity}


@dataclass(frozen=True)
class PolicyResult:
    decision: str
    violations: list[Violation] = field(default_factory=list)
    evaluated_at: datetime | None = None


@dataclass(frozen=True)
class RiskFactorItem:
    code: str
    label: str
    weight: int
    detail: str

    def to_dict(self) -> dict:
        return {"code": self.code, "label": self.label, "weight": self.weight, "detail": self.detail}


@dataclass(frozen=True)
class RiskResult:
    score: int
    category: str  # low | medium | high | critical
    factors: list[RiskFactorItem]
