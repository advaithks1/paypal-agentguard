# Architecture

## Flow
Agent → `POST /purchase-requests` → deterministic policy engine + risk evaluation → decision
(`auto_approved` | `needs_approval` | `blocked`) → human approval if needed → PayPal Orders v2
(create → buyer approval → capture) → webhooks update transaction lifecycle → audit log.

## Principles
1. **Deterministic policy engine decides; AI explains.** LLM output never overrides a policy block.
2. **PayPal secrets live only in the backend.** The frontend holds only a user JWT (sessionStorage).
3. **Every record carries `data_source`** (`demo` | `backend` | `paypal_sandbox` | `paypal_live`); the UI shows a Demo badge for `demo`.
4. **Single service layer.** Pages call `src/services/*`. Stage 1 ships a `demoService` with the same method signatures as the real API service, so Stage 2 swaps implementations, not pages.

## Frontend layout
`layouts/` shell · `pages/` routes · `components/` UI kit · `contexts/` auth + notifications · `services/` API + demo · `types/` contracts · `utils/` formatting.

## Backend (Stage 2/3 targets)
FastAPI routers (`api/`), Pydantic schemas, Supabase Postgres + Auth, `integrations/paypal`, `policies/` engine, `agents/` LLM services.
