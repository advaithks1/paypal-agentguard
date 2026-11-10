# Run and check PayPal AgentGuard

Two ways to run the frontend: **api mode** (real backend, real PayPal Sandbox) and **demo mode** (no backend, simulated and labelled).

## 1. Backend (needed for api mode)
Requirements: Python 3.11+.
```bat
cd backend
python -m venv .venv
.venv\Scripts\activate            :: macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            :: macOS/Linux: cp .env.example .env
python -m pytest -q               :: expect: 172 passed
uvicorn app.main:app --reload --port 8000
```
Edit `backend/.env`:
| Variable | Needed for | Notes |
|---|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal checkout | Sandbox REST app credentials (see below) |
| `PAYPAL_BASE_URL` | | Leave as `https://api-m.sandbox.paypal.com` |
| `GEMINI_API_KEY` | AI parsing and explanations | Optional. Without it everything works with rule-based text, labelled as such |
| `JWT_SECRET` | login | Set a long random string |
| `FRONTEND_ORIGIN` | CORS and PayPal return URLs | `http://localhost:5173` |
| `PAYPAL_WEBHOOK_ID` | webhook verification | Optional. Payments complete via return-URL capture without it |

Check it: open http://localhost:8000/api/v1/health. You should see `"status":"ok"` and `paypal_configured: true`.

### Getting PayPal Sandbox credentials (about 3 minutes)
1. Go to https://developer.paypal.com and log in, then open **Apps & Credentials** and make sure the **Sandbox** toggle is selected.
2. **Create App** (type Merchant). Copy the **Client ID** and **Secret** into `backend/.env`.
3. Open **Testing Tools > Sandbox Accounts**. Use the default **Personal** (buyer) account, click **...** > **View/Edit account** and note its email and password. You log in with it on PayPal's page during checkout.

## 2. Frontend
Requirements: Node.js 18+ (`node -v`).
```bat
cd frontend
copy .env.example .env            :: VITE_DATA_MODE=api for the real backend, demo for no backend
npm install
npm run typecheck
npm run build                     :: must end with "built in ...s"
npm run dev                       :: http://localhost:5173
```
Vite reads `.env` only at startup: restart `npm run dev` after changing it.

## 3. Manual checklist (api mode)
- [ ] **Register** a new account, then you land on the Dashboard (empty states, no errors).
- [ ] **Settings** shows PayPal configured (Sandbox) and Gemini configured or "falling back to rule-based".
- [ ] **Purchase requests > Run demo scenario**: 4 rows appear (auto-approved, needs approval, blocked restricted merchant, blocked prompt-injection). No payment is made.
- [ ] Ask the agent: `Buy a USB-C hub under $40 from Amazon`. The card shows the parsed request, **Auto-approved**, risk score and an explanation labelled **Gemini** or **Rule-based**.
- [ ] Click **Pay with PayPal**: you are redirected to PayPal Sandbox. Log in as the sandbox buyer and approve.
- [ ] You return to `/paypal/return?token=...`: "Payment successful", with a **PayPal Sandbox** badge. Reload the page: still successful (idempotent).
- [ ] **Transactions** shows the row as Captured with the PayPal Sandbox badge; **Audit logs** (filter Payments) shows `payment.order_created` and `payment.captured`; **Dashboard** volume increased.
- [ ] Ask: `Renew our Figma team plan for $145`. It lands in **Approval centre**. Approve with a note, then **Pay with PayPal**.
- [ ] On a captured payment, click **Refund payment** and confirm: status becomes Refunded.
- [ ] Ask the prompt-injection example. It is **Blocked** and the policy message names the instruction-like text.
- [ ] Press **Cancel** on the PayPal page: `/paypal/cancel` explains nothing was charged.
- [ ] **Spending policies**: type `Lower the auto-approve limit to $100` in the Copilot. A diff appears; nothing changes until **Confirm and save**.
- [ ] Risk, Merchants, Analytics, Settings load without errors. Narrow the window: the sidebar becomes a menu.

## 4. Demo mode (no backend)
Set `VITE_DATA_MODE=demo`. Everything carries a violet **Demo** badge. The agent chat, approvals, policies and audit log work against an in-browser simulation (not the real policy engine). PayPal checkout, refunds and the Policy Copilot show a clear "needs the real backend" message.

## 5. Optional: PayPal smoke test without the UI
```bat
cd backend
python ..\scripts\paypal_smoke_test.py
```
Creates a sandbox order, opens PayPal for approval, captures and optionally refunds.

## 6. Troubleshooting
| Symptom | Fix |
|---|---|
| "Cannot reach the AgentGuard API" | Backend not running, or `VITE_API_BASE_URL` wrong. |
| CORS error in the console | `FRONTEND_ORIGIN` in `backend/.env` must equal the browser address exactly. Restart the backend. |
| 503 `paypal_not_configured` | PayPal keys missing in `backend/.env`. Restart the backend. |
| PayPal page says it cannot log in | Use the sandbox **buyer** account, not your real PayPal or the merchant account. |
| Returned from PayPal but "Payment not completed" | You did not finish approval. Press Try again, or resume from the Approval centre. |
| Redirected to login after PayPal | Sessions live in `sessionStorage` (per tab). Log in again; you return to the same page. |
| Port 5173 busy | Vite picks another port; set `FRONTEND_ORIGIN` to match. |


## 3. Check the new features (needs sandbox keys; Vault must be enabled on the PayPal app)
| Feature | How to check | Expected |
|---|---|---|
| Authorize / capture | Ask `Renew our Figma team plan for $145` > **Hold funds with PayPal** > approve as sandbox buyer > Approval centre | "Funds held by PayPal" + countdown; **Approve** then **Capture**; **Reject** voids the hold |
| Agent Wallet | Agent wallet > **Connect PayPal** > approve > ask `Buy a USB-C cable from Amazon for $25 using my agent wallet` | Paid with no redirect, badge "Charged by agent, no human click". Set per-transaction cap 20 and repeat: lands in Approval centre |
| Vault not enabled | Same flow on an app without Vault | Clear 503 message with enable steps; the rest of the app works |
| MCP | Agents page > create key > `AGENTGUARD_API_KEY=agk_... python scripts/mcp_client_demo.py` | safe buy paid, large buy held, injection BLOCKED. See `docs/MCP.md` |
| Timeline | Transactions > open a row | Live badge, events in order, PayPal events highlighted; **Narrate** shows a Gemini/rules label; sandbox simulator adds an UNVERIFIED labelled event only |

Tests: `cd backend && python -m pytest -q` (172) and `cd frontend && npm run build`.
