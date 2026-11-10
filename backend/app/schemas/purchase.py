from typing import Literal

from pydantic import BaseModel, Field, field_validator

Currency = Literal["USD", "EUR", "GBP", "INR", "CAD", "AUD"]
Priority = Literal["low", "normal", "high", "urgent"]


class PurchaseRequestCreate(BaseModel):
    item: str = Field(min_length=1, max_length=200)
    merchant: str = Field(min_length=1, max_length=160)
    amount: float = Field(gt=0, le=1_000_000)
    currency: Currency = "USD"
    description: str = Field(default="", max_length=1000)
    reason: str = Field(default="", max_length=1000)
    priority: Priority = "normal"
    use_agent_wallet: bool = False  # ask to be paid from the vaulted agent wallet (still policy + guardrails first)

    @field_validator("item", "merchant")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("amount")
    @classmethod
    def _round(cls, v: float) -> float:
        return round(v, 2)


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=3, max_length=1000)


class DecisionRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=500)
