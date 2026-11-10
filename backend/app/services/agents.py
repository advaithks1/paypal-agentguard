"""Agent identities (API keys) and the tool logic behind the MCP server.

Agents can only REQUEST purchases. Nothing here approves, captures, voids or refunds a payment: the deterministic
policy engine decides, the guardrails limit autonomous spending, and humans approve the rest.
"""
from datetime import timedelta

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.gemini import GeminiClient
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import agent_key_matches, generate_agent_key, hash_agent_key
from app.core.util import iso, naive_utcnow
from app.integrations.paypal import PayPalClient
from app.models import Agent, AgentCall, AuditLog, PurchaseRequest, User
from app.schemas.purchase import PurchaseRequestCreate
from app.services import audit, wallet
from app.services import requests as requests_svc
from app.services.serializers import policy_out

TOOLS = ("request_purchase", "check_request_status", "get_spending_budget", "list_policies", "explain_decision")
SOURCE = "Agent via MCP"


class AgentError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message

    def to_dict(self) -> dict:
        return {"ok": False, "error": self.code, "message": self.message}


# ---------- management (called from the UI API) ----------

def agent_out(db: Session, a: Agent) -> dict:
    hour_ago = naive_utcnow() - timedelta(hours=1)
    total = db.scalar(select(func.count()).select_from(AgentCall).where(AgentCall.agent_id == a.id)) or 0
    recent = db.scalar(select(func.count()).select_from(AgentCall).where(AgentCall.agent_id == a.id, AgentCall.created_at >= hour_ago)) or 0
    requests = db.scalar(select(func.count()).select_from(PurchaseRequest).where(PurchaseRequest.user_id == a.user_id, PurchaseRequest.agent_name == a.name)) or 0
    return {"id": a.id, "name": a.name, "key_prefix": a.key_prefix, "status": a.status, "created_at": iso(a.created_at), "last_used_at": iso(a.last_used_at),
            "revoked_at": iso(a.revoked_at), "calls_total": total, "calls_last_hour": recent, "purchase_requests": requests}


def list_agents(db: Session, user: User) -> list[dict]:
    rows = db.scalars(select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc())).all()
    return [agent_out(db, a) for a in rows]


def create_agent(db: Session, user: User, name: str) -> tuple[Agent, str]:
    name = " ".join(name.split())
    if db.scalar(select(Agent.id).where(Agent.user_id == user.id, Agent.name == name, Agent.status == "active")):
        raise AppError(409, "agent_exists", f"An active agent named '{name}' already exists. Revoke it or pick another name.")
    key, prefix, key_hash = generate_agent_key()
    a = Agent(user_id=user.id, name=name, key_prefix=prefix, key_hash=key_hash)
    db.add(a)
    db.flush()
    audit.record(db, actor=user.id, user_id=user.id, action="agent.created", entity_type="agent", entity_id=a.id, detail=f"Agent '{name}' created (key {prefix}...).")
    db.commit()
    return a, key  # the key is returned to the caller once and is not recoverable


def revoke_agent(db: Session, user: User, agent_id: str) -> Agent:
    a = db.get(Agent, agent_id)
    if a is None or a.user_id != user.id:
        raise AppError(404, "not_found", "Agent not found.")
    if a.status != "revoked":
        a.status, a.revoked_at = "revoked", naive_utcnow()
        audit.record(db, actor=user.id, user_id=user.id, action="agent.key_revoked", entity_type="agent", entity_id=a.id, detail=f"API key of agent '{a.name}' revoked.")
        db.commit()
    return a


def agent_activity(db: Session, user: User, agent_id: str, limit: int = 50) -> dict:
    a = db.get(Agent, agent_id)
    if a is None or a.user_id != user.id:
        raise AppError(404, "not_found", "Agent not found.")
    logs = db.scalars(select(AuditLog).where(AuditLog.user_id == user.id, AuditLog.actor == f"agent:{a.name}").order_by(AuditLog.created_at.desc()).limit(limit)).all()
    prs = db.scalars(select(PurchaseRequest).where(PurchaseRequest.user_id == user.id, PurchaseRequest.agent_name == a.name).order_by(PurchaseRequest.created_at.desc()).limit(20)).all()
    return {"agent": agent_out(db, a),
            "events": [{"id": l.id, "action": l.action, "detail": l.detail, "created_at": iso(l.created_at), "source": SOURCE if l.action.startswith("mcp.") else "AgentGuard"} for l in logs],
            "requests": [{"id": p.id, "item": p.item, "merchant": p.merchant, "amount": p.amount, "currency": p.currency, "status": p.status,
                          "decision": (p.policy_evaluation or {}).get("decision"), "payment_status": p.payment_status, "created_at": iso(p.created_at)} for p in prs]}


# ---------- authentication, rate limit, audit ----------

def authenticate(db: Session, api_key: str | None) -> Agent:
    key = (api_key or "").strip()
    if not key.startswith("agk_") or len(key) < 20:
        audit.record(db, actor="agent:unknown", action="mcp.auth_failed", entity_type="agent", detail="Missing or malformed agent API key.")
        db.commit()
        raise AgentError("unauthenticated", "Missing or invalid agent API key.")
    for a in db.scalars(select(Agent).where(Agent.key_prefix == key[:12])):
        if agent_key_matches(key, a.key_hash):
            if a.status != "active":
                audit.record(db, actor=f"agent:{a.name}", user_id=a.user_id, action="mcp.auth_failed", entity_type="agent", entity_id=a.id, detail="Revoked key was used.")
                db.commit()
                raise AgentError("key_revoked", "This agent API key has been revoked.")
            return a
    audit.record(db, actor="agent:unknown", action="mcp.auth_failed", entity_type="agent", detail=f"Unknown key with prefix {key[:12]}.")
    db.commit()
    raise AgentError("unauthenticated", "Missing or invalid agent API key.")


def check_rate_limit(db: Session, a: Agent) -> None:
    limit = get_settings().mcp_rate_limit_per_minute
    since = naive_utcnow() - timedelta(seconds=60)
    n = db.scalar(select(func.count()).select_from(AgentCall).where(AgentCall.agent_id == a.id, AgentCall.created_at >= since)) or 0
    if n >= limit:
        audit.record(db, actor=f"agent:{a.name}", user_id=a.user_id, action="mcp.rate_limited", entity_type="agent", entity_id=a.id, detail=f"More than {limit} calls in 60 seconds.")
        db.commit()
        raise AgentError("rate_limited", f"Rate limit: at most {limit} calls per minute per agent key. Try again shortly.")


# ---------- tools ----------

def _own_request(db: Session, a: Agent, request_id: str) -> PurchaseRequest:
    pr = db.get(PurchaseRequest, request_id)
    if pr is None or pr.user_id != a.user_id or pr.agent_name != a.name:  # an agent only sees requests it made itself
        raise AgentError("not_found", "No purchase request with that id was made by this agent.")
    return pr


def _status(pr: PurchaseRequest) -> dict:
    decision = (pr.policy_evaluation or {}).get("decision")
    nxt = {"approved": "Approved by policy. Payment is made via the agent wallet if connected, otherwise the owner pays.",
           "pending_approval": "Waiting for the human owner to approve in AgentGuard. The agent cannot approve it.",
           "blocked": "Blocked by the policy engine. It will never be paid."}.get(pr.status, "")
    return {"request_id": pr.id, "status": pr.status, "policy_decision": decision, "approval_status": pr.approval_status, "payment_status": pr.payment_status,
            "amount": pr.amount, "currency": pr.currency, "merchant": pr.merchant, "next": nxt}


def tool_request_purchase(db: Session, a: Agent, paypal: PayPalClient, gemini: GeminiClient | None, description: str, amount: float,
                          merchant: str, currency: str = "USD") -> dict:
    user = db.get(User, a.user_id)
    try:
        data = PurchaseRequestCreate(item=(description or "")[:200] or " ", merchant=merchant, amount=amount, currency=currency,
                                     description=description or "", reason=f"Requested by agent '{a.name}' via MCP.")
    except ValidationError as e:
        first = e.errors()[0]
        raise AgentError("invalid_request", f"{'.'.join(str(x) for x in first['loc'])}: {first['msg']}") from e
    # Policy engine decides (including prompt-injection detection on the untrusted text). The agent's wording cannot change the outcome.
    pr = requests_svc.create_purchase_request(db, user, data, gemini, agent_name=a.name, source_prompt=None)
    out = _status(pr)
    if (pr.policy_evaluation or {}).get("decision") == "auto_approved":
        res = wallet.try_autonomous_charge(db, paypal, user, pr)  # guardrails are checked inside, before any vault charge
        db.refresh(pr)
        out = _status(pr)
        out["wallet_outcome"], out["message"] = res["outcome"], res["message"]
    elif pr.status == "blocked":
        out["message"] = "Blocked by policy. " + (pr.ai_explanation or "")
    else:
        out["message"] = "Held for human approval. The agent cannot approve or pay this request."
    out["explanation_source"] = (pr.risk_assessment or {}).get("explanation_source")
    return {"ok": True, **out}


def tool_check_request_status(db: Session, a: Agent, request_id: str) -> dict:
    return {"ok": True, **_status(_own_request(db, a, request_id))}


def tool_get_spending_budget(db: Session, a: Agent) -> dict:
    g = wallet.get_guardrail(db, a.user_id, a.name)
    w = wallet.get_wallet(db, a.user_id)
    db.commit()
    spent = wallet.spent_today(db, a.user_id, "USD", None if g.agent_name == "*" else g.agent_name)
    return {"ok": True, "agent": a.name, "currency": "USD", "daily_cap": g.daily_cap, "spent_today": round(spent, 2), "remaining_today": round(max(0.0, g.daily_cap - spent), 2),
            "per_transaction_cap": g.per_transaction_cap, "allowed_merchants": g.allowed_merchants or [], "agent_wallet": w.status if w else "not_connected",
            "note": "Purchases above these limits are not refused; they wait for human approval."}


def tool_list_policies(db: Session, a: Agent) -> dict:
    from app.services.seed import default_policy_for
    p = policy_out(default_policy_for(a.user_id, db))
    db.commit()
    keep = ("max_auto_amount", "max_transaction_amount", "daily_limit", "manual_approval_threshold", "allowed_currencies", "approved_merchants", "restricted_merchants",
            "duplicate_protection", "duplicate_window_minutes")
    return {"ok": True, "policy": {k: p[k] for k in keep if k in p}, "rules": [
        "Requests above max_transaction_amount or at restricted merchants are blocked.",
        "Requests above max_auto_amount need human approval.",
        "Text that tries to instruct the guard (e.g. 'ignore previous instructions', 'auto-approve') is blocked.",
        "Only a human can approve; no agent tool can approve or capture a payment."]}


def tool_explain_decision(db: Session, a: Agent, request_id: str) -> dict:
    pr = _own_request(db, a, request_id)
    ev, ra = pr.policy_evaluation or {}, pr.risk_assessment or {}
    src = {"gemini": "Gemini", "rule_based": "rules"}.get(ra.get("explanation_source"), "rules")
    return {"ok": True, "request_id": pr.id, "decision": ev.get("decision"), "explanation": pr.ai_explanation, "explanation_source": src,
            "risk_score": ra.get("score"), "risk_category": ra.get("category"),
            "violations": [{"rule": v.get("rule") or v.get("code"), "message": v.get("message"), "severity": v.get("severity")} for v in ev.get("violations", [])]}


def dispatch(db: Session, api_key: str | None, tool: str, args: dict, *, paypal: PayPalClient, gemini: GeminiClient | None = None) -> dict:
    """Single entry point used by the MCP server (and tests). Authenticates, rate-limits, audits, then runs one tool.

    Always returns a dict; failures are {"ok": False, "error": code, "message": ...}. Never raises to the MCP client."""
    try:
        if tool not in TOOLS:
            raise AgentError("unknown_tool", f"Unknown tool '{tool}'.")
        a = authenticate(db, api_key)
        check_rate_limit(db, a)
    except AgentError as e:
        return e.to_dict()
    a.last_used_at = naive_utcnow()
    call = AgentCall(agent_id=a.id, tool=tool, ok=True)
    db.add(call)
    try:
        if tool == "request_purchase":
            res = tool_request_purchase(db, a, paypal, gemini, str(args.get("description", "")), args.get("amount", 0), str(args.get("merchant", "")), str(args.get("currency", "USD")))
        elif tool == "check_request_status":
            res = tool_check_request_status(db, a, str(args.get("request_id", "")))
        elif tool == "get_spending_budget":
            res = tool_get_spending_budget(db, a)
        elif tool == "list_policies":
            res = tool_list_policies(db, a)
        else:
            res = tool_explain_decision(db, a, str(args.get("request_id", "")))
    except AgentError as e:
        call.ok, res = False, e.to_dict()
    except AppError as e:  # e.g. vault_not_enabled
        call.ok, res = False, {"ok": False, "error": e.code, "message": e.message}
    detail = f"[MCP] {tool}" + (f" -> request {res.get('request_id')} {res.get('status')}" if res.get("request_id") else "") + ("" if res.get("ok") else f" failed: {res.get('error')}")
    audit.record(db, actor=f"agent:{a.name}", user_id=a.user_id, action=f"mcp.{tool}", entity_type="agent", entity_id=a.id, detail=detail)
    db.commit()
    return res
