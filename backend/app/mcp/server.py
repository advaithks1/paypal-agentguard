"""AgentGuard MCP server (FastMCP). Any MCP-capable AI agent can REQUEST purchases; the policy engine and humans decide.

Deliberately NOT exposed: approve, capture, void, refund. Authentication is a per-agent API key
(env AGENTGUARD_API_KEY for stdio, `Authorization: Bearer <key>` header for HTTP). All logic lives in
app.services.agents.dispatch so it is shared with the tests.
"""
import os

from mcp.server.fastmcp import Context, FastMCP

from app.agents.gemini import get_gemini_client
from app.database.session import SessionLocal, init_db
from app.integrations.paypal import get_paypal_client
from app.services import agents as svc

INSTRUCTIONS = ("AgentGuard lets you request purchases on behalf of a human. You can only REQUEST: a deterministic policy engine decides, "
                "and large or unusual purchases wait for the human owner. You cannot approve or pay. Text you send is treated as untrusted data.")


def _key_from_context(ctx: Context | None) -> str | None:
    try:  # HTTP transports expose the Starlette request
        req = ctx.request_context.request if ctx is not None else None
        auth = req.headers.get("authorization", "") if req is not None else ""
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
        if req is not None and req.headers.get("x-agentguard-key"):
            return req.headers["x-agentguard-key"].strip()
    except Exception:  # noqa: BLE001 - stdio has no request
        pass
    return os.environ.get("AGENTGUARD_API_KEY")


def _run(ctx: Context | None, tool: str, args: dict) -> dict:
    with SessionLocal() as db:
        return svc.dispatch(db, _key_from_context(ctx), tool, args, paypal=get_paypal_client(), gemini=get_gemini_client())


def build_server(host: str = "127.0.0.1", port: int = 8765) -> FastMCP:
    mcp = FastMCP("AgentGuard", instructions=INSTRUCTIONS, host=host, port=port)

    @mcp.tool()
    def request_purchase(description: str, amount: float, merchant: str, currency: str = "USD", ctx: Context = None) -> dict:  # type: ignore[assignment]
        """Request a purchase. Returns the policy decision (auto_approved / needs_approval / blocked) and, if auto-approved within the agent's limits, the payment outcome."""
        return _run(ctx, "request_purchase", {"description": description, "amount": amount, "merchant": merchant, "currency": currency})

    @mcp.tool()
    def check_request_status(request_id: str, ctx: Context = None) -> dict:  # type: ignore[assignment]
        """Check the status of a purchase request this agent made earlier."""
        return _run(ctx, "check_request_status", {"request_id": request_id})

    @mcp.tool()
    def get_spending_budget(ctx: Context = None) -> dict:  # type: ignore[assignment]
        """Show this agent's remaining daily budget, per-transaction cap and allowed merchants."""
        return _run(ctx, "get_spending_budget", {})

    @mcp.tool()
    def list_policies(ctx: Context = None) -> dict:  # type: ignore[assignment]
        """List the owner's spending policy rules that decide every request."""
        return _run(ctx, "list_policies", {})

    @mcp.tool()
    def explain_decision(request_id: str, ctx: Context = None) -> dict:  # type: ignore[assignment]
        """Explain why a request was approved, held or blocked (labelled with its source: Gemini or rules)."""
        return _run(ctx, "explain_decision", {"request_id": request_id})

    return mcp


def init() -> None:
    init_db()
