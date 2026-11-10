"""SQLAlchemy models. Field names mirror frontend/src/types/index.ts.

Every record that can be shown in the UI carries `data_source`
('backend' | 'paypal_sandbox' | 'paypal_live'); 'demo' is never written by the backend.
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.util import new_id, utcnow
from app.database.session import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("usr_"))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Merchant(Base):
    __tablename__ = "merchants"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("m_"))
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(80), default="General")
    status: Mapped[str] = mapped_column(String(20), default="unreviewed")  # trusted|restricted|unreviewed
    trust_score: Mapped[int] = mapped_column(Integer, default=50)
    per_transaction_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="USD")


class Policy(Base):
    """One spending policy per user."""
    __tablename__ = "policies"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("pol_"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    max_auto_amount: Mapped[float] = mapped_column(Float, default=50.0)
    max_transaction_amount: Mapped[float] = mapped_column(Float, default=300.0)
    daily_limit: Mapped[float] = mapped_column(Float, default=500.0)
    manual_approval_threshold: Mapped[float] = mapped_column(Float, default=50.0)
    allowed_currencies: Mapped[list] = mapped_column(JSON, default=lambda: ["USD"])
    approved_merchants: Mapped[list] = mapped_column(JSON, default=list)
    restricted_merchants: Mapped[list] = mapped_column(JSON, default=list)
    duplicate_protection: Mapped[bool] = mapped_column(Boolean, default=True)
    duplicate_window_minutes: Mapped[int] = mapped_column(Integer, default=60)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("pr_"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item: Mapped[str] = mapped_column(String(200))
    merchant: Mapped[str] = mapped_column(String(160), index=True)
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    description: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(10), default="normal")
    agent_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="submitted")
    policy_evaluation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    risk_assessment: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approval_status: Mapped[str] = mapped_column(String(20), default="not_required")
    payment_status: Mapped[str] = mapped_column(String(20), default="not_started")
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)  # original natural-language goal
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    data_source: Mapped[str] = mapped_column(String(20), default="backend")


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("apr_"))
    purchase_request_id: Mapped[str] = mapped_column(ForeignKey("purchase_requests.id", ondelete="CASCADE"), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    purchase_request: Mapped[PurchaseRequest] = relationship()


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("txn_"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purchase_request_id: Mapped[str | None] = mapped_column(ForeignKey("purchase_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    merchant: Mapped[str] = mapped_column(String(160), index=True)
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    risk_category: Mapped[str] = mapped_column(String(10), default="low")
    policy_decision: Mapped[str] = mapped_column(String(20))
    payment_status: Mapped[str] = mapped_column(String(20), default="not_started")
    paypal_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    data_source: Mapped[str] = mapped_column(String(20), default="backend")


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("pay_"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purchase_request_id: Mapped[str] = mapped_column(ForeignKey("purchase_requests.id", ondelete="CASCADE"), index=True)
    paypal_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    paypal_capture_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="not_started")
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    approval_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str] = mapped_column(String(64), default=lambda: new_id("rid_"))  # PayPal-Request-Id (idempotency)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    data_source: Mapped[str] = mapped_column(String(20), default="paypal_sandbox")
    # Phase 1: authorize now, capture after human approval
    intent: Mapped[str] = mapped_column(String(10), default="capture")  # capture | authorize
    authorization_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    authorization_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    captured_amount: Mapped[float] = mapped_column(Float, default=0.0)
    capture_count: Mapped[int] = mapped_column(Integer, default=0)
    reauth_count: Mapped[int] = mapped_column(Integer, default=0)
    hold_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    hold_explanation_source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Phase 2: charged from the vaulted agent wallet with no human click
    autonomous: Mapped[bool] = mapped_column(Boolean, default=False)
    agent_name: Mapped[str | None] = mapped_column(String(80), nullable=True)


class AgentWallet(Base):
    """One vaulted PayPal account per user. Only PayPal vault ids are stored, never credentials."""
    __tablename__ = "agent_wallets"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("wal_"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | active | revoked
    setup_token_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vault_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    paypal_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    data_source: Mapped[str] = mapped_column(String(20), default="paypal_sandbox")


class AgentGuardrail(Base):
    """Per-agent spending limits ('*' = every agent). Enforced server-side before any vault charge."""
    __tablename__ = "agent_guardrails"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("gr_"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    agent_name: Mapped[str] = mapped_column(String(80), default="*")
    daily_cap: Mapped[float] = mapped_column(Float, default=100.0)
    per_transaction_cap: Mapped[float] = mapped_column(Float, default=50.0)
    allowed_merchants: Mapped[list] = mapped_column(JSON, default=list)  # empty = any merchant the policy engine accepts
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


class Agent(Base):
    """An AI agent identity. The API key is shown once; only its SHA-256 hash and a short prefix are stored."""
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("agt_"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    key_prefix: Mapped[str] = mapped_column(String(16), index=True)
    key_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(12), default="active")  # active | revoked
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AgentCall(Base):
    """One MCP tool call by an agent (used for rate limiting and the per-agent activity view)."""
    __tablename__ = "agent_calls"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("call_"))
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    tool: Mapped[str] = mapped_column(String(40))
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class TransactionEvent(Base):
    """A PayPal webhook event attached to a purchase request (timeline source 'PayPal webhook'). Unique by PayPal event id."""
    __tablename__ = "transaction_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("evt_"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purchase_request_id: Mapped[str] = mapped_column(ForeignKey("purchase_requests.id", ondelete="CASCADE"), index=True)
    payment_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    paypal_event_id: Mapped[str] = mapped_column(String(80), unique=True)
    event_type: Mapped[str] = mapped_column(String(60))
    paypal_ids: Mapped[dict] = mapped_column(JSON, default=dict)  # order_id, authorization_id, capture_id, resource_id
    verified: Mapped[bool] = mapped_column(Boolean, default=True)  # signature verified by PayPal
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)  # sandbox helper: timeline only, never changes payment state
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("aud_"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(80))  # user id, 'agent:<name>' or 'system'
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    data_source: Mapped[str] = mapped_column(String(20), default="backend")


Index("ix_pr_user_created", PurchaseRequest.user_id, PurchaseRequest.created_at)
