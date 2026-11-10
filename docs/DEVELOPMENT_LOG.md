# Development Log

## Stage 1 — Batch 1
- Repo structure, LICENSE, .gitignore, README.
- Frontend config: Vite + React + strict TS + Tailwind (navy sidebar, brand blue, surface greys).
- Domain types (`src/types/index.ts`); every record carries `data_source` so demo data stays labelled.
- Centralized API client (`src/services/api.ts`) targeting `VITE_API_BASE_URL`.
- NOT verified: `npm install` / `npm run build` (sandbox has no network access).

## Stage 1 — Batch 2
- User verified Batch 1: `npm install` OK, `tsc -b` OK; build failed only on missing `main.tsx` (added here).
- Added `VITE_DATA_MODE` (`demo` | `api`); `services/config.ts`, demo-aware `services/auth.ts` (no real authentication in demo mode).
- App entry, routing, `ProtectedRoute`, `AuthContext`, `NotificationContext` (toasts + bell history).
- UI kit: StatusBadge, RiskBadge, DemoBadge/DemoBanner, MetricCard, Modal, FormField, Skeletons, States (empty/error), ErrorBoundary, Toaster, NotificationBell, PageHeader.
- Layout: Sidebar (desktop + mobile drawer), Header, AppLayout. Login and Register pages with validation.
- `UpcomingPage` is TEMPORARY and renders for routes whose pages arrive in Batches 3-5.

## Stage 1 — Batch 3
- Demo data layer (`services/demo/*`): seeded generator, 80 simulated transactions (all `data_source: 'demo'`, `paypal_order_id: null`), 12 demo merchants, demo dashboard summary and transaction detail (risk factors + policy violations from simple rules; AI explanation is `null`).
- Services: `transactionService` (list/get) and `dashboardService` switch between demo data and the real API via `VITE_DATA_MODE`.
- Query params for `GET /transactions`: `search, policy_decision, payment_status, risk_category, sort_by, sort_dir, page, page_size`. `GET /transactions/{id}` returns `TransactionDetail`.
- New types: `TransactionQuery`, `TransactionSortKey`, `SortDir`, `TransactionDetail`.
- Components: Card, Pagination, TransactionTable (sortable, compact mode), TransactionDetailModal, HistoryBarChart, RiskDonut, UtilizationMeter, ChartCard. Hooks: `useAsync`, `useDebounce`.
- Pages: Dashboard, Transactions (search, 3 filters, sorting, pagination, detail view).
- Demo semantics: blocked = policy `blocked`; pending = `needs_approval` with payment `not_started`; approved = everything else. Volume = captured USD only.

## Hackathon Phase 1 - Backend foundation (FastAPI + SQLite)
- Decision: SQLite via SQLAlchemy 2 (not Supabase) for a 3-day deadline and one-command judge setup.
- `backend/app`: `core` (pydantic-settings config, bcrypt + PyJWT security, uniform `{"error":{code,message,details}}` handlers incl. router 404/405), `database` (engine, `init_db`), `models/entities.py` (users, merchants, policies, purchase_requests, approvals, transactions, payments, audit_logs; all carry `data_source`), `schemas`, `api` (health, auth), `services` (audit helper, seed).
- Auth: `POST /auth/register|login`, `GET /auth/me`; emails normalized, same error for unknown email and wrong password, passwords truncated safely at bcrypt's 72-byte limit. Register also seeds a default policy (trusted merchants approved, restricted merchants blocked).
- `GET /health` reports which integrations are configured, never secrets.
- Verified here: `pytest` 13 passed; real `uvicorn` boot, seed script, register and health via curl.

## Hackathon Phase 2 - Policy + risk engine (pure, no I/O)
- `backend/app/policies/`: `types.py` (frozen dataclasses), `engine.py` (`evaluate_policy`), `risk.py` (`assess_risk`, `category_for`, `final_decision`), `injection.py` (`find_injection`, `wrap_untrusted`).
- Policy rules. Blocking: invalid amount, instruction-like text (prompt injection), disallowed currency, restricted merchant (policy list OR directory status), over per-transaction max, over merchant per-tx limit, over merchant monthly limit, over daily limit. Warning (needs approval): merchant not on approved list, possible duplicate, amount above auto limit or at/above manual threshold. Merchant names match exactly (case-insensitive), never by substring.
- Decision: any blocking -> `blocked`; else any warning -> `needs_approval`; else `auto_approved`. `final_decision` lets risk only ESCALATE auto -> needs_approval (high/critical risk); blocks can never be relaxed.
- Risk: weighted factors summed and capped at 100; categories low <25, medium <50, high <75, critical >=75. Callers compute `SpendHistory` from the DB and pass it in.
- Verified: `pytest` 59 passed.

## Hackathon Phase 3 - PayPal integration (Orders v2)
- `integrations/paypal.py`: sync httpx client; OAuth2 client-credentials token cached until 60s before expiry; retries with backoff on network errors, 429 and 5xx (max 2); `PayPal-Request-Id` on every mutating call; typed `PayPalError` (4xx -> HTTP 400, upstream/network/auth failures -> 502, not configured -> 503); `ORDER_ALREADY_CAPTURED` replays safely by reading the order; webhook verification via `/v1/notifications/verify-webhook-signature` (needs `PAYPAL_WEBHOOK_ID`, otherwise 503 `webhook_not_configured`; docs fall back to polling `GET order`).
- `services/payments.py`: `create_order`, `capture`, `refund`, `void_order`, `apply_webhook_event`. Amounts always come from the DB, never the client. Only `auto_approved`, or `needs_approval` with a human approval, can reach PayPal; blocked/rejected never do. Create and capture are idempotent. Webhooks are idempotent by event id and never move a captured payment backwards. Every step writes an audit log with `data_source` `paypal_sandbox`.
- Honest note: PayPal has no "void" for a CAPTURE-intent order nobody approved (it just expires), so `void_order` cancels it inside AgentGuard and says so in the audit trail.
- `scripts/paypal_smoke_test.py`: real sandbox create -> browser approval -> capture -> optional refund. Refuses non-sandbox URLs.
- Verified here (mocked httpx): `pytest` 81 passed. NOT verified against live PayPal (sandbox has no internet): the user must run the smoke test.

## Hackathon Phase 4 - Gemini agents
- `agents/gemini.py`: REST client (key in `x-goog-api-key` header), structured JSON (`responseMimeType` + `responseSchema`), thinking disabled, retries with backoff, 30 s cooldown after rate limiting, any failure -> `GeminiUnavailable`.
- `ShoppingAgent` (`shopping.py`): goal wrapped in untrusted delimiters, output validated with Pydantic, invalid output or Gemini failure -> regex parser; no amount -> 422 asking the user.
- `RiskExplainer`: only restates the final decision; an explanation that contradicts the decision (e.g. calls a blocked purchase safe) is discarded for the rule-based text. Source stored as `explanation_source`.
- `PolicyCopilot`: proposes a diff, validates bounds, rejects manipulative instructions, never saves.
- NOT verified against live Gemini (no internet here). Request shape follows the public REST docs; any rejection degrades to rule-based, never a crash.

## Hackathon Phase 5 - API
- All endpoints in `docs/API_CONTRACT.md`. Pipeline in `services/requests.py`: policy -> risk -> `final_decision` -> explanation -> status/approval/transaction/audit.
- Verified: `pytest` 119 passed, including end-to-end flows (request -> approval -> PayPal create/capture/refund with mocked PayPal), tenant isolation, webhook, and 503 without credentials.

## Hackathon Phase 6, items 1-2 - Frontend services and Purchase requests
- Added types (`ExplanationSource`, `AgentChatResponse`, `PolicyCopilotResponse`, `HealthStatus`, queries) and services for every endpoint in API_CONTRACT.md using the `isDemoMode ? demo : api` pattern. Demo mode uses an in-memory simulation (`services/demo/workflow.ts`), all records `data_source: 'demo'`; PayPal/Copilot are explicitly unavailable in demo mode rather than faked.
- New shared components: `SourceBadge`/`PayPalBadge` (PayPal Sandbox badge), `ExplanationNote` (labels Gemini vs rule-based), `Drawer`, `RequestDetail`, `PaymentActions` (create-order -> redirect to approval_url, refund with confirm), `AgentResult`. `TransactionTable` now uses `SourceBadge`.
- `PurchaseRequests` page: hero agent chat (POST /agent/chat), example prompts, parsed request + decision + risk + labelled explanation, requests table with status filter, pagination and detail drawer, "Run demo scenario".
- Verified: real `npm install`, `npm run build` passes (tsc strict + vite).

## Hackathon Phase 6, item 3 - Approval centre + PayPal return/cancel
- `Approvals` page: tabs (pending/approved/rejected/all), per-card decision note, approve/reject, labelled explanation, drawer with full detail. Approving switches to the Approved tab so "Pay with PayPal" (create-order -> redirect to `approval_url`, https only) is immediately visible; approved/paid items show refund via `PaymentActions`.
- `PaypalReturn` (`/paypal/return?token=<orderId>`): validates token shape, `POST /payments/capture` once per attempt (StrictMode-safe), success / pending / error states, Try again, links to dashboard/transactions/audit log. Backend capture is idempotent so a reload shows the same success. `PaypalCancel` explains nothing was captured.
- `ProtectedRoute` preserves `location.search` so the PayPal token survives a login redirect.
- Verified: build passes; backend `pytest` 119 passed; live API JSON shapes (agent/chat, approvals) match the TS types.

## Hackathon Phase 6, items 4-7 - Policies, remaining pages, wiring
- `Policies`: PolicyCopilot (POST /policies/copilot -> labelled proposal, warnings, old/new diff table, explicit "Confirm and save" -> PUT /policies; Discard) + manual form with client-side validation mirroring the backend (auto <= max, currency required, approved/restricted cannot overlap).
- `Risk` (distribution, drivers, rules triggered, who wrote explanations, highest-risk transactions), `Merchants` (search, trust bar, limits), `AuditLogs` (prefix filter + pagination), `Analytics` (metrics, history, decision breakdown, spend by merchant; `BarList` component), `Settings` (/health integration status, account, data mode).
- Dashboard + TransactionDetailModal: removed hard-coded "simulated" wording in api mode, explanation now labelled via `ExplanationNote`, PayPal Sandbox badge on payment status. `UpcomingPage` deleted; all routes real.
- `.env.example` defaults to api mode; `RUN_AND_CHECK.md` rewritten (backend + frontend + PayPal sandbox credentials + checklist).
- Verified: `npm run build` passes at each step.

## Hackathon Phase 8 - Submission package
- README rewritten for judges (what/why, 5-minute setup, PayPal sandbox credential steps, Mermaid architecture, PayPal and Gemini usage, security design, tests, "What was built during the hackathon" stating the project was significantly updated after Oct 1).
- `docs/DEVPOST_DESCRIPTION.md` (all Devpost sections), `docs/DEMO_VIDEO_SCRIPT.md` (timed, under 3 min, with fallbacks), `render.yaml` (backend web service + frontend static site).

## Phase 7 (session 2, no network, static verification only)
- 7.1 Audit: all backend routes in `app/api/*` match `services/*.ts`; `serializers.py` output matches `types/index.ts`; payment guard flow (`ensure_payable`, idempotent create/capture) matches `PaymentActions` and `PaypalReturn`. Fix: `PaypalReturn` pending state now offers a Check again button.
- 7.2 `DemoWalkthrough` card on Purchase requests (judge walkthrough mirroring `DEMO_VIDEO_SCRIPT.md`).
- NOT verified: `npm run build`, `pytest` (no pip/npm access this session). A partial `tsc` run with missing-type noise filtered found no real errors in the touched files.
- 7.3 Narrow-width review: added wrapping for long agent text in AgentResult and Approvals cards. 7.4 waits on the user's repo/video/live URLs.
