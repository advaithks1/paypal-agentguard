# HANDOFF (5-phase hackathon plan). Older history: docs/HANDOFF.md (phases 1-8 of the first build, all done).
Deadline: Thu Nov 12 2026, 12:00 PT. Baseline before this plan: 119 backend tests passing.

## Status
| Phase | Status |
|---|---|
| 1 Authorize now, capture after human approval | **Done** (136 backend tests pass, `npm run build` OK) |
| 2 PayPal Vault agent wallet | **Done** (151 backend tests pass, `npm run build` OK) |
| 3 MCP server (FastMCP) | **Backend verified by user** (163 backend tests pass on Windows, mcp 1.30, pywin32 306 pinned). Frontend TS errors in Agents.tsx fixed (not re-built by me). MCP demo script + live PayPal vault run still unverified |
| 4 Event timeline | **Done** (172 backend tests pass, `npm run build` OK; verified in sandbox, live PayPal webhooks still unverified) |
| 5 Wrap-up (README, docs, final zip) | **Done** (README, Devpost text, 2:45 script, RUN_AND_CHECK, .env.example updated; LICENSE is MIT) |

## Phase 1: what was built
- Backend
  - `integrations/paypal.py`: `create_order(intent=)`, `authorize_order`, `get_authorization`, `capture_authorization`, `void_authorization`, `reauthorize`; webhook map adds `PAYMENT.AUTHORIZATION.CREATED/VOIDED`.
  - `models/entities.py` Payment: `intent, authorization_id, authorization_expires_at, captured_amount, capture_count, reauth_count, hold_explanation(+_source)`. `database/session.py` auto-adds missing columns to an existing SQLite file (`_add_missing_columns`).
  - `services/payments.py`: forward-only state machine (`can_transition`; states order_created, buyer_approved, authorized, partially_captured, captured, voided, expired, failed, refunded), `resolve_intent`, `ensure_authorizable`, `ensure_capturable` (policy rule: approved AND amount <= still-authorized), `authorize`, `capture_authorization` (partial capture, per-attempt idempotency key), `void_authorization`, `release_hold_on_rejection`, `reauthorize`, lazy `refresh_expiry`, idempotent webhook handler.
  - `services/requests.py decide_approval(..., paypal=)`: rejecting auto-voids the hold (PayPal failure is audited as `payment.void_failed`, rejection still succeeds).
  - `agents/risk_explainer.py explain_hold()`: Gemini + rule fallback, labelled source, consistency check.
  - New endpoints (all under `/api/v1/payments`): `POST /authorize {paypal_order_id}`, `POST /{id}/capture-authorization {amount?, final_capture?}`, `POST /{id}/void-authorization`, `POST /{id}/reauthorize`; `create-order` accepts `intent` (authorize|capture|auto). `payment_out` adds `intent, authorization_id, authorization_expires_at, expires_in_seconds, expiring_soon, funds_held, captured_amount, remaining_authorized, hold_explanation(+_source)`.
  - Env: `PAYMENT_MODE=auto|authorize|capture`, `AUTH_EXPIRY_WARN_HOURS=48`.
- Frontend: types, `paymentService` (authorize/captureAuthorization/voidAuthorization/reauthorize), `useCountdown`, `PaymentActions` (hold button, "Funds held by PayPal" panel with explanation + source, countdown, expiring warning, Capture / partial capture / Void / Reauthorize), Approvals pending cards show the hold UI, `PaypalReturn` calls authorize first (falls back to capture), StatusBadge has new states.
- Tests: `backend/tests/test_authorize.py` (17 tests: happy path, void on reject, void-failure audit, partial capture, replay safety, blocked cannot authorize, amount mismatch, expiry, webhooks never go backwards, ownership, explainer).

## Decisions and gotchas
- Default flow: needs_approval -> buyer authorizes (hold) -> human approves -> Capture button. Approved requests with no order still use one-step CAPTURE (frontend passes intent=capture).
- Behaviour change: a PENDING needs_approval request may now create an AUTHORIZE order (money only held). Explicit CAPTURE before approval is still refused (`approval_required`). Two old tests were updated to pass `intent="capture"` for that check.
- `/payments/capture` on an authorize-intent order returns 409 `use_authorize_flow`; `/payments/authorize` on a capture order returns 409 `use_capture_flow` (PaypalReturn relies on this).
- Refund works on the LAST capture id only (`paypal_capture_id`); multi-capture refunds are not modelled.
- Sandbox: reauthorize is only accepted by PayPal after the 3-day honor period; the error is surfaced as-is. Authorize/capture/void/reauthorize are UNVERIFIED against the live sandbox (mocked HTTP only). Verify with real keys.
- Expiry is computed lazily (on by-request read and capture); no background job.

## Phase 2: what was built
- Backend
  - `integrations/paypal.py`: `create_setup_token`, `create_payment_token`, `delete_payment_token`, `charge_vault` (Orders v2 CAPTURE with `payment_source.paypal.vault_id` + `stored_credential` MERCHANT/SUBSEQUENT, PayPal-Request-Id, no redirect).
  - Models `AgentWallet` (status pending|active|revoked, vault_id, customer_id; ids only) and `AgentGuardrail` (agent_name '*' default, daily_cap, per_transaction_cap, allowed_merchants); Payment gets `autonomous`, `agent_name`.
  - `policies/guardrails.py` (pure `check_guardrails`), `services/wallet.py` (connect_start/complete, revoke, update_guardrail, `try_autonomous_charge`, wallet_state, spent_today).
  - Flow: policy engine decides first; only `auto_approved` + active wallet + guardrails pass -> vault charge. Guardrail violation -> request becomes `needs_approval` (Approval row, rule-based explanation, audit `wallet.guardrail_fallback`), no PayPal call. Blocked / needs_approval never use the vault. Charge failure -> request stays approved, audit `wallet.charge_failed`.
  - Vault not enabled (401/403/NOT_AUTHORIZED) -> 503 `vault_not_enabled` with step-by-step enable instructions.
  - Endpoints (`/api/v1/wallet`): `GET /`, `POST /connect`, `POST /complete {setup_token_id}`, `POST /revoke`, `PUT /guardrails`. `POST /purchase-requests` accepts `use_agent_wallet`; `POST /agent/chat` detects "my/agent wallet" and returns `wallet_outcome` + `payment`.
  - Audit actions: wallet.consent_started, wallet.connected, wallet.revoked, wallet.guardrails_updated, wallet.guardrail_fallback, wallet.charge_failed, payment.autonomous_charge (actor `agent:<name>`).
- Frontend: `pages/AgentWallet.tsx` (connect/revoke, daily budget meter, guardrail form, recent charges with "Charged by agent, no human click" badge), `pages/WalletReturn.tsx` (route `/wallet/return`), `services/wallet.ts` (demo mode: clear "needs real backend" error), nav item "Agent wallet", badge also in PaymentActions.
- Tests: `backend/tests/test_wallet.py` (15 tests: connect/idempotent, no-redirect charge, per-txn cap fallback, daily cap, merchant allowlist, blocked never charges, revoke, vault-not-enabled, charge failure, shopping agent phrase).

## Phase 2 gotchas
- Vault calls are UNVERIFIED on the live sandbox (mocked HTTP only). Setup-token return param is assumed `approval_token_id` (WalletReturn also accepts `token`). If PayPal rejects `stored_credential` on vault orders, remove it in `charge_vault`.
- The Shopping Agent wallet phrase is detected by regex on the user message (not by Gemini), so it works with or without a key; the parsed request still goes through the full policy engine.
- Guardrails: UI edits only the '*' (all agents) row; the backend already supports per-agent rows via `agent_name`, which Phase 3 (MCP agent identities) will use.
- Daily budget counts today's autonomous captured payments (USD in the UI).

## Phase 3: what was built (UNTESTED, see below)
- Backend: models `Agent` (key_prefix + SHA-256 key_hash, status, last_used_at) and `AgentCall` (rate limit + activity); `core/security` agent key helpers (`agk_` keys, shown once); `services/agents.py` (create/revoke/list/activity, `authenticate`, `check_rate_limit`, tools `tool_*`, and `dispatch()` = auth -> rate limit -> tool -> audit `mcp.<tool>`, never raises); `app/mcp/server.py` (FastMCP, 5 tools, key from `AGENTGUARD_API_KEY` env for stdio or `Authorization: Bearer` / `X-AgentGuard-Key` for HTTP); `api/agents.py` (`GET/POST /api/v1/agents`, `POST /{id}/revoke`, `GET /{id}/activity`); env `MCP_RATE_LIMIT_PER_MINUTE=30`; `mcp>=1.2` added to requirements.
- Scripts/docs: `scripts/mcp_server.py` (stdio | `--transport http`), `scripts/mcp_client_demo.py` (safe buy / large buy held / injection blocked), `docs/MCP.md` (Claude Desktop config).
- Frontend: `pages/Agents.tsx`, `services/agents.ts`, types, route `/agents`, nav item.
- Tests: `backend/tests/test_mcp.py` (12 tests; reuses fixtures from test_wallet).
- Design: agents only see requests they created; per-agent guardrail row is keyed by agent name (create body can set caps); no approve/capture tool exists; injection text is blocked by the existing engine.

## Phase 4: what was built (tested: pytest + tsc/vite)
- Backend: model `TransactionEvent` (PayPal webhook events, unique `paypal_event_id`, `verified`, `simulated`, `paypal_ids` JSON); `services/timeline.py` (`build_timeline` merges AuditLog entries + webhook events, sources `AgentGuard` / `Agent via MCP` / `PayPal webhook`; `record_webhook_event` idempotent; `is_live`; `simulate_event`); hook in `payments.apply_webhook_event` stores each verified event (old `paypal.webhook` audit rows are excluded from the timeline to avoid duplicates); `agents/narrator.py` (Gemini + rules fallback + consistency check).
- Endpoints (`/api/v1/transactions`): `GET /{id}/timeline` (`live` flag; UI polls every 3 s), `POST /{id}/narrate` (`source` gemini|rule_based, `source_label` Gemini|rules), `POST /{id}/simulate-webhook {event_type}` (sandbox base URL only; adds an UNVERIFIED, labelled event to the timeline ONLY; never changes payment state; 409 if no payment yet).
- Frontend: `components/TransactionTimeline.tsx` (icons, PayPal events highlighted, Live/Final badge, narrate button with source label, sandbox simulator), wired into `TransactionDetailModal` (demo mode keeps the old static timeline with a note), `transactionService.timeline/narrate/simulateWebhook`, types.
- Tests: `backend/tests/test_timeline.py` (9 tests: ordering/sources/live, webhook dedupe, unverified webhook excluded, simulator safety, owner privacy, narration fallback + Gemini consistency).
- Gotchas: no SSE (polling only); timeline paypal_ids for audit rows come from the CURRENT payment row; webhook events for state-less types (not in `status_from_webhook_event`) are ignored and not stored.

## Phase 3 verify notes (tests now pass; demo/build still to confirm). Windows: use mcp<2 and pywin32==306 (312 + stale System32 pywin DLLs broke win32api)
1. `cd backend && pip install -r requirements.txt && python -m pytest -q` (expect 151 old + 12 new). Likely trouble spots: `tests/test_mcp.py` imports fixtures from `tests.test_wallet`; `payment_status`/`status` strings asserted in the safe-buy test; MCP SDK API (`FastMCP(host=, port=)`, `ctx.request_context.request`, `list_tools()`, `streamable-http` transport name) may differ by `mcp` version.
2. `cd frontend && npm install && npm run build` (new page `Agents.tsx` never type-checked).
3. Run the demo: create an agent key in the UI, connect the wallet, `python scripts/mcp_client_demo.py`.
4. HTTP mode reads the key from the request header via `ctx.request_context.request`; if that fails on your SDK version, use stdio.

## Phase 4 fixes made while verifying
- `payments.create_order`: added `db.flush()` after `db.add(payment)` so the `payment.order_created` audit row gets a real entity_id (it was None, so the timeline dropped it).
- `TransactionTimeline.tsx`: `simType` typed as `useState<string>` (TS2345 under strict).

## Next steps: none in the plan. Manual: add keys, enable Vault, run mcp_client_demo.py live, record video, submit on Devpost.
## (done) Phase 5 wrap-up (README, docs/DEVPOST, 2:45 video script, RUN_AND_CHECK, final zip)

## (older) next steps after verifying Phase 3
1. `pip install mcp` (add to requirements.txt). New models `Agent` (id, user_id, name, key_hash, key_prefix, status, created_at, last_used_at) and optionally `AgentCall` for rate limiting; API key shown once, stored hashed (use `core/security`).
2. `app/mcp/server.py` FastMCP tools: request_purchase, check_request_status, get_spending_budget, list_policies, explain_decision. NO approve/capture tool. request_purchase calls `requests.create_purchase_request(agent_name=agent.name)` then `wallet.try_autonomous_charge` (uses the agent's guardrail row). Rate limit + audit every call (actor `agent:<name>`, source "Agent via MCP").
3. `scripts/mcp_server.py` (stdio + streamable HTTP), `scripts/mcp_client_demo.py` (safe buy via vault, large buy held for approval, injection blocked), `docs/MCP.md` with Claude Desktop config.
4. API `/api/v1/agents` (list/create/revoke key, per-agent activity) + Agents page in the frontend.

## How to test
```
cd backend && python -m pytest -q        # expect 151 passed
cd frontend && npm install && npm run build
```
Live check (needs sandbox keys): create a 120 USD Figma request -> "Hold funds with PayPal" -> approve as sandbox buyer -> Approval centre shows "Funds held" -> Approve -> Capture (or Reject to see the void).
Phase 2 live check (needs Vault enabled on the sandbox app): Agent wallet -> Connect PayPal -> approve as sandbox buyer -> back on /wallet/return -> on Purchase requests ask "Buy a USB-C cable from Amazon for $25 using my agent wallet" -> paid with no redirect; set per-transaction cap to 20 and repeat -> lands in the Approval centre.
