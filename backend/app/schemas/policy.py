from pydantic import BaseModel, Field

from app.schemas.purchase import Currency

POLICY_FIELDS = ["max_auto_amount", "max_transaction_amount", "daily_limit", "manual_approval_threshold", "allowed_currencies",
                 "approved_merchants", "restricted_merchants", "duplicate_protection", "duplicate_window_minutes"]


class PolicyUpdate(BaseModel):
    max_auto_amount: float = Field(ge=0, le=1_000_000)
    max_transaction_amount: float = Field(gt=0, le=1_000_000)
    daily_limit: float = Field(gt=0, le=10_000_000)
    manual_approval_threshold: float = Field(ge=0, le=1_000_000)
    allowed_currencies: list[Currency] = Field(min_length=1)
    approved_merchants: list[str] = Field(max_length=200)
    restricted_merchants: list[str] = Field(max_length=200)
    duplicate_protection: bool
    duplicate_window_minutes: int = Field(ge=1, le=1440)


class CopilotRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=600)
