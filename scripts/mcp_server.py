"""Run the AgentGuard MCP server.

  stdio (Claude Desktop):  AGENTGUARD_API_KEY=agk_... python scripts/mcp_server.py
  HTTP:                    python scripts/mcp_server.py --transport http --port 8765   (send Authorization: Bearer agk_...)

Run from the repo root with backend/ on the path; the script handles that. Uses backend/.env like the API.
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)  # so .env and the SQLite file resolve exactly like the API server

from app.mcp.server import build_server, init  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    init()
    server = build_server(a.host, a.port)
    server.run(transport="stdio" if a.transport == "stdio" else "streamable-http")


if __name__ == "__main__":
    main()
