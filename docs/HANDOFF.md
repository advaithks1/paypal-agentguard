# HANDOFF (read this first)

## Status
Phases 1-6 DONE (session 2 re-audited 6 against the backend: matches). Phase 8 DONE (README, DEVPOST_DESCRIPTION, DEMO_VIDEO_SCRIPT, render.yaml). Phase 7 polish IN PROGRESS (optional items). PayPal live flow and Gemini unverified by builder: the USER MUST run the checklist in docs/RUN_AND_CHECK.md with real sandbox keys.

## Phase 6 progress
- [x] Phase 6 items 1-7 (see DEVELOPMENT_LOG).
- [x] Phase 8: README.md, docs/DEVPOST_DESCRIPTION.md, docs/DEMO_VIDEO_SCRIPT.md, render.yaml.
- [ ] Phase 7: guided demo checklist on Purchase requests; mobile check; fix bugs the user reports.

## NEXT STEP (exact)
User, in this order: (1) `cd frontend && npm install && npm run build` and `cd backend && python -m pytest -q` (expect 119 passed): session 2 could NOT run them, paste any error text to the next chat; (2) go through docs/RUN_AND_CHECK.md section 3 with real sandbox keys, including the new Guided demo card; (3) record the video per docs/DEMO_VIDEO_SCRIPT.md (under 3:00); (4) fill the 3 links in docs/DEVPOST_DESCRIPTION.md; (5) submit on Devpost before Nov 12 2026 12:00 PT.

## NEXT PROMPT (paste this into a new chat with the latest zip)
> Continue PayPal AgentGuard (deadline Nov 12 2026 12:00 PT). Read docs/HANDOFF.md, API_CONTRACT.md, DEVELOPMENT_LOG.md. Phases 1-6 and 8 are done; I am in Phase 7. First fix any build/test/PayPal/Gemini error the user pastes. If none: help with 7.4 (fill links), tighten DEMO_VIDEO_SCRIPT timing against the real UI, then do optional polish only. Rules: PayPal sandbox central, honest data labels (Demo / PayPal Sandbox / Gemini vs rule-based), policy engine decides and Gemini only explains, no secrets in frontend, demo mode keeps working. Small verified steps; update HANDOFF.md and rebuild the zip after every 2 items; write the next prompt BEFORE each big item. If bash has network, run `cd frontend && npm install && npm run build` and `cd backend && pip install -r requirements.txt && python -m pytest -q` first (expect 119 passed).

## Phase 7 checklist (session 2, no network: NOT compiled by `npm run build`; only a partial tsc pass with missing-@types noise filtered, no real errors in touched files. USER: run `npm run build` and `python -m pytest -q`)
- [x] 7.1 Audit frontend services/types vs API_CONTRACT.md and backend routes: all 20 routes, serializers and TS types match. Fixed: PaypalReturn 'pending' state now has a 'Check again' button.
- [x] 7.2 Guided demo card on Purchase requests: `components/DemoWalkthrough.tsx` (3 'Try it' agent cases with done ticks + approve/pay step linking to /approvals; demo mode says PayPal needs the backend). `PurchaseRequests.send()` now returns boolean.
- [x] 7.3 Narrow-width review of Purchase requests + Approvals (static): long agent text (e.g. the prompt-injection item) could overflow flex rows; added `min-w-0 break-words` in AgentResult and Approvals. Tables already scroll (`overflow-x-auto`), Drawer is full-width on phones. Still to eyeball in a real narrow browser.
- [ ] 7.4 BLOCKED ON USER: fill the 3 placeholders on the Links line of docs/DEVPOST_DESCRIPTION.md (repo URL, video URL, optional live URL). README has none.

## Frontend conventions (Phase 6)
- Services: `src/services/*.ts`, each `isDemoMode ? demo : api`. Demo implementations live in `services/demo/workflow.ts` (in-memory, all `data_source: 'demo'`; PayPal and Policy Copilot throw a clear `demo_mode` error instead of faking results).
- Shared UI: `SourceBadge` (Demo / PayPal Sandbox), `ExplanationNote` (labels gemini vs rule-based), `Drawer`, `RequestDetail`, `PaymentActions` (Pay with PayPal + refund), `AgentResult`.
- Verified here with real `npm install` + `npm run build` (the sandbox can reach the npm registry).

## Decisions
- FastAPI + SQLite/SQLAlchemy 2, Pydantic v2, bcrypt (direct) + PyJWT. API prefix `/api/v1`.
- Errors: `{"error": {"code","message","details?"}}` via `AppError` in `app/core/errors.py`.
- IDs are prefixed strings (`usr_`, `pr_`, `txn_`...). Timestamps stored naive UTC; serialize with `app.core.util.iso`.
- Tests override `get_db` with an in-memory SQLite session (see `tests/conftest.py`).

## Commands (Windows)
```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      :: then fill keys
python -m pytest -q
python -m app.services.seed
uvicorn app.main:app --reload --port 8000
```

## Engine API (Phase 2)
`app.policies`: `evaluate_policy(PurchaseInput, PolicyConfig, MerchantInfo|None, SpendHistory) -> PolicyResult`; `assess_risk(..., policy_result) -> RiskResult`; `final_decision(policy_result, risk)`. Phase 5 must build `SpendHistory` from DB: spent_today = sum of amounts for payment_status captured or approved-in-flight today (same currency); duplicates = same merchant+amount+currency within `duplicate_window_minutes`.

## Payments API (Phase 3)
`app.integrations.paypal.get_paypal_client()` is the FastAPI dependency (override in tests). `app.services.payments`: `create_order(db, client, user, pr, return_url, cancel_url)`, `capture(db, client, user, paypal_order_id)`, `refund(db, client, user, payment_id, amount=None)`, `void_order`, `apply_webhook_event(db, verified_event)`.
Phase 5 MUST: store the FINAL decision (after `final_decision`) in `purchase_requests.policy_evaluation["decision"]`; set `approval_status` to `approved` when a human approves; return URL = `{FRONTEND_ORIGIN}/paypal/return` (PayPal appends `?token=<order_id>&PayerID=...`), cancel = `/paypal/cancel`; webhook route should call `client.verify_webhook(request.headers, event)` then `apply_webhook_event`; if `PAYPAL_WEBHOOK_ID` is unset, also offer `GET /payments/{id}/sync` that polls `client.get_order`.

## Known issues
- Live PayPal sandbox flow and live Gemini are not verified by the builder (no PayPal/Gemini access here); the user must run them.
- Demo mode: demo transactions list does not include requests created in the demo workflow.
- Rejected approvals keep `policy_decision=needs_approval` on their Transaction row (backend behaviour).
