# AgentGuard MCP server

Any MCP-capable AI agent can **request** purchases through AgentGuard. A deterministic policy engine decides; humans approve the rest.
There is **no tool to approve, capture, void or refund**. Prompt-injection text in a request is blocked by the policy engine.

> Status: written in Phase 3 without being executed in the build sandbox (no network). Verify with `pytest backend/tests/test_mcp.py` and the demo below.

## Tools
| Tool | What it does |
|---|---|
| `request_purchase(description, amount, merchant, currency="USD")` | Creates a request. Returns `auto_approved` (paid via the Agent Wallet vault if connected and within this agent's limits), `needs_approval` (waits for the human) or `blocked`. |
| `check_request_status(request_id)` | Status of a request this agent made. |
| `get_spending_budget()` | Remaining daily budget, per-transaction cap, allowed merchants, wallet state. |
| `list_policies()` | The owner's rules. |
| `explain_decision(request_id)` | Why it was approved/held/blocked, labelled `Gemini` or `rules`. |

## Setup
1. `pip install -r backend/requirements.txt` and start the API (`uvicorn app.main:app` in `backend/`) once so the tables exist.
2. In the app open **Agents**, create an agent, **copy the key (shown once)**. Revoke it there any time.
3. (For vault payments) connect **Agent wallet** and set limits. Per-agent limits are set when creating the agent.

## Claude Desktop (stdio)
Add to `claude_desktop_config.json` (use your real paths; on Windows use double backslashes):
```json
{
  "mcpServers": {
    "agentguard": {
      "command": "python",
      "args": ["D:\\paypal-agentguard\\scripts\\mcp_server.py"],
      "env": { "AGENTGUARD_API_KEY": "agk_paste_your_key_here" }
    }
  }
}
```
The server reads `backend/.env` and the same SQLite database as the API.

## HTTP (any other MCP client)
```
python scripts/mcp_server.py --transport http --port 8765
```
Endpoint `http://127.0.0.1:8765/mcp`, header `Authorization: Bearer agk_...`.

## Demo (video centrepiece)
```
AGENTGUARD_API_KEY=agk_... python scripts/mcp_client_demo.py
```
Safe buy (vault, no redirect) -> large buy held -> injection blocked. Then approve the held one in the Approval centre.

## Security notes
- Keys: 256-bit random, only a SHA-256 hash and a 12-char prefix are stored; revocation is immediate.
- Every call is attributed to the agent, rate-limited (`MCP_RATE_LIMIT_PER_MINUTE`, default 30) and written to the audit log (`mcp.<tool>`).
- An agent can only read requests it created itself.
