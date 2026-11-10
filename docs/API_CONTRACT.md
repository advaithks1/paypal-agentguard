# API Contract (backend v0.1, prefix `/api/v1`)

Types mirror `frontend/src/types/index.ts`. Money is a number in major units. Timestamps are ISO-8601 UTC.
Auth: `Authorization: Bearer <jwt>` on everything except `/health`, `/auth/register`, `/auth/login`, `/payments/webhook`.
Errors: `{"error": {"code": string, "message": string, "details"?: any}}`. Common codes: `unauthenticated` 401, `not_found` 404, `validation_error` 422, `conflict`/`email_taken` 409, `paypal_not_configured` 503, `paypal_error` 400/502, `paypal_unreachable` 502.
`data_source` is `backend` (made by the API) or `paypal_sandbox` (touched PayPal). The backend never writes `demo`.

| Method & path | Body / query | Returns |
|---|---|---|
| GET `/health` | | `{status, paypal_configured, paypal_mode, paypal_webhook_verification, gemini_configured, gemini_model}` |
| POST `/auth/register` | `{email, password(8+), full_name}` | `AuthResponse` (201) |
| POST `/auth/login` | `{email, password}` | `AuthResponse` |
| GET `/auth/me` | | `User` |
| GET `/dashboard/summary` | | `DashboardSummary` |
| GET `/transactions` | `search, policy_decision, payment_status, risk_category, sort_by, sort_dir, page, page_size` | `Paginated<Transaction>` |
| GET `/transactions/{id}` | | `TransactionDetail` (timeline built from the audit log) |
| POST `/purchase-requests` | `PurchaseRequestCreate` | `PurchaseRequest` (201), already evaluated |
| GET `/purchase-requests` | `status, page, page_size` | `Paginated<PurchaseRequest>` |
| GET `/purchase-requests/{id}` | | `PurchaseRequest` |
| GET `/approvals` | `status` | `Approval[]` |
| POST `/approvals/{id}/decide` | `{decision: "approved"\|"rejected", note?}` | `Approval` (409 `already_decided`) |
| GET `/policies` | | `SpendingPolicy` |
| PUT `/policies` | full `SpendingPolicy` fields | `SpendingPolicy` (422 `invalid_policy`) |
| POST `/policies/copilot` | `{instruction}` | `{summary, changes, diff[{field,old,new}], proposed_policy, source, warnings}`. PROPOSAL ONLY; confirm with `PUT /policies` |
| GET `/merchants` | | `Merchant[]` |
| GET `/audit-logs` | `action` (prefix), `page, page_size` | `Paginated<AuditLog>` |
| POST `/agent/chat` | `{message}` | `{reply, parser_source: "gemini"\|"rule_based", purchase_request}` |
| POST `/payments/create-order` | `{purchase_request_id}` | `Payment` with `approval_url` (201). 409 `not_payable`/`approval_required` |
| POST `/payments/capture` | `{paypal_order_id}` | `Payment` (idempotent) |
| POST `/payments/{id}/refund` | `{amount?}` | `Payment` |
| POST `/payments/{id}/void` | | `Payment` (local cancel; PayPal lets unapproved orders expire) |
| GET `/payments/by-request/{pr_id}` | | `Payment \| null` |
| GET `/payments/{id}/sync` | | `Payment` (polls PayPal; fallback when no webhook) |
| POST `/payments/webhook` | PayPal event | `{handled}`; signature verified with PayPal (400 `invalid_signature`, 503 `webhook_not_configured`) |
| POST `/demo/run-scenario` | | `{items: PurchaseRequest[4]}`: auto-approved, needs-approval, blocked restricted merchant, blocked prompt-injection. No payment is made |

## Extra fields beyond `types/index.ts`
- `PurchaseRequest.source_prompt: string | null`.
- `RiskAssessment.explanation_source: "gemini" | "rule_based"` (UI must label rule-based text honestly).

## Decision rules (deterministic, see `backend/app/policies`)
Blocking: invalid amount, instruction-like text, disallowed currency, restricted merchant, over per-transaction max, over merchant limits, over daily limit.
Needs approval: merchant not approved, possible duplicate, amount above auto limit, or risk score high/critical. Else auto-approved.
