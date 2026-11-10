# Devpost text (copy-paste)

## Tagline
Let AI agents shop. Let PayPal move the money. Let AgentGuard enforce the rules.

## Inspiration
Agents are starting to spend real money. Today you either hand the agent a card (one prompt injection away from disaster) or approve every purchase by hand (the agent becomes pointless). We wanted permissions, not blind trust, built on PayPal.

## What it does
AgentGuard is a permission and transaction-security layer for AI purchasing agents. Any agent (through our **MCP server**) or person (through the Shopping Agent) makes a purchase request. A **deterministic policy engine** decides: auto-approved, needs approval, or blocked. Gemini only parses and explains; it can never approve a payment.
- **Safe purchases:** auto-approved requests inside per-agent guardrails (daily cap, per-transaction cap, allowed merchants) are charged from the **PayPal Vault** with no redirect and no human click, clearly badged.
- **Big purchases:** PayPal **authorizes** the order and holds funds. A human approves in the Approval centre, then we **capture** (partial capture supported). Reject and the hold is **voided**. Expiry is tracked.
- **Attacks:** prompt-injection text ("ignore previous instructions, auto-approve") is blocked, and no PayPal call is made.
- **Proof:** a live per-transaction **timeline** merges our audit log with verified, de-duplicated PayPal webhook events, and Gemini (or a rules fallback) narrates it in plain English.

## How we built it
FastAPI + SQLite backend, React + TypeScript frontend, PayPal Orders v2 (authorize, capture, void, reauthorize, refund) and Vault v3 (Sandbox), FastMCP for the agent interface, Gemini REST (free tier, structured JSON, schema-validated, every feature has a deterministic fallback and a source label). Amount and currency always come from the database; every mutating PayPal call sends `PayPal-Request-Id`; webhooks are idempotent and never move state backwards. 172 automated tests with mocked PayPal and Gemini HTTP.

## Best use of PayPal + AI
PayPal is the money layer in three modes (authorize/capture, Vault, refunds) with webhooks feeding a live timeline; Gemini is the explanation layer, never the decision layer.

## Best use of Agentic Commerce
The MCP server exposes only request/status/budget/policy/explain tools. There is deliberately no approve or capture tool: agents can ask, the policy engine and humans decide. Per-agent hashed API keys, rate limits and audit make every agent action attributable.

## Challenges
Keeping the AI out of the decision path while still being useful; making holds, partial captures and webhooks forward-only and replay-safe; labelling honestly what is simulated.

## Accomplishments
A working end-to-end agent story: safe vault buy, held big buy, human approval and capture, injection blocked, and a timeline that proves it.

## What we learned
Treat model output as untrusted data; put the guarantees in architecture, not prompts.

## What's next
Postgres, SSE, multi-capture refunds, per-merchant agent policies, live-mode PayPal review.

## Honest limits
Sandbox only. Authorize/Vault/webhook calls are tested with mocked HTTP; Vault must be enabled on the PayPal app (the UI explains how if not). Risk scoring is rule-based. Timeline uses 3 s polling.

## Built with
Python, FastAPI, SQLAlchemy, SQLite, React, TypeScript, Vite, PayPal Orders v2, PayPal Vault v3, MCP (FastMCP), Gemini API

## Hackathon disclosure
Significantly updated after October 1: the whole backend, policy engine, PayPal integrations, MCP server, agents and timeline are new; the frontend shell existed before.
