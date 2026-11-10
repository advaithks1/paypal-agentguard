"""PayPal REST client (Orders v2 + Payments v2), sandbox by default. Sync httpx, injectable transport for tests.

Flow: create_order -> buyer approves at approval_url -> capture_order -> (refund_capture).
Idempotency: every mutating call sends a PayPal-Request-Id. Secrets never leave the backend or get logged.
"""
import base64
import logging
import threading
import time
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Callable

import httpx

from app.core.config import Settings, get_settings
from app.core.errors import AppError

log = logging.getLogger("agentguard.paypal")


class PayPalNotConfigured(AppError):
    def __init__(self) -> None:
        super().__init__(503, "paypal_not_configured", "PayPal sandbox credentials are not set in backend/.env.")


class PayPalError(AppError):
    """PayPal answered with an error (or could not be reached). Message is safe to show to users."""

    def __init__(self, upstream_status: int, name: str, message: str, debug_id: str | None = None, issues: list | None = None):
        http = 502 if upstream_status in (0, 401, 403, 429) or upstream_status >= 500 else 400
        if upstream_status == 404:
            http = 404
        super().__init__(http, "paypal_error" if upstream_status else "paypal_unreachable",
                         f"PayPal: {message}", {"paypal_name": name, "paypal_debug_id": debug_id, "issues": issues or [], "upstream_status": upstream_status})
        self.upstream_status, self.name, self.debug_id = upstream_status, name, debug_id

    def has_issue(self, issue: str) -> bool:
        return any(i.get("issue") == issue for i in (self.details or {}).get("issues", []))


def money(amount: float | Decimal, currency: str = "USD") -> str:
    """PayPal wants a string with exactly 2 decimals (our supported currencies all have 2)."""
    return str(Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


@dataclass
class OrderResult:
    id: str
    status: str
    approval_url: str | None
    raw: dict


@dataclass
class CaptureResult:
    order_id: str
    order_status: str
    capture_id: str | None
    capture_status: str | None
    amount: str | None
    currency: str | None
    raw: dict


@dataclass
class AuthorizationResult:
    order_id: str
    order_status: str
    authorization_id: str | None
    status: str | None  # CREATED | PENDING | DENIED ...
    amount: str | None
    currency: str | None
    expires_at: str | None
    raw: dict


def _first_authorization(order: dict) -> dict | None:
    for pu in order.get("purchase_units", []):
        auths = (pu.get("payments") or {}).get("authorizations") or []
        if auths:
            return auths[0]
    return None


def _approval_url(order: dict) -> str | None:
    for link in order.get("links", []):
        if link.get("rel") in ("payer-action", "approve"):
            return link.get("href")
    return None


def _first_capture(order: dict) -> dict | None:
    for pu in order.get("purchase_units", []):
        caps = (pu.get("payments") or {}).get("captures") or []
        if caps:
            return caps[0]
    return None


def payment_status_from_capture(order_status: str | None, capture_status: str | None) -> str:
    cs = (capture_status or "").upper()
    if cs == "COMPLETED":
        return "captured"
    if cs in ("DECLINED", "FAILED"):
        return "failed"
    if cs in ("REFUNDED", "PARTIALLY_REFUNDED"):
        return "refunded"
    return payment_status_from_order(order_status)


def payment_status_from_order(order_status: str | None) -> str:
    return {"CREATED": "order_created", "PAYER_ACTION_REQUIRED": "order_created", "SAVED": "order_created",
            "APPROVED": "buyer_approved", "COMPLETED": "captured", "VOIDED": "voided"}.get((order_status or "").upper(), "order_created")


def status_from_webhook_event(event_type: str) -> str | None:
    return {"CHECKOUT.ORDER.APPROVED": "buyer_approved", "PAYMENT.CAPTURE.COMPLETED": "captured",
            "PAYMENT.AUTHORIZATION.CREATED": "authorized", "PAYMENT.AUTHORIZATION.VOIDED": "voided",
            "PAYMENT.CAPTURE.DENIED": "failed", "PAYMENT.CAPTURE.DECLINED": "failed",
            "PAYMENT.CAPTURE.REFUNDED": "refunded", "PAYMENT.CAPTURE.REVERSED": "refunded"}.get(event_type)


class PayPalClient:
    def __init__(self, settings: Settings | None = None, transport: httpx.BaseTransport | None = None,
                 sleep: Callable[[float], None] = time.sleep, max_retries: int = 2):
        self.s = settings or get_settings()
        self._http = httpx.Client(base_url=self.s.paypal_base_url.rstrip("/"), transport=transport, timeout=httpx.Timeout(20.0, connect=8.0))
        self._sleep, self._max_retries = sleep, max_retries
        self._token: str | None = None
        self._token_exp = 0.0
        self._lock = threading.Lock()

    # ---- auth ----
    def _access_token(self) -> str:
        if not self.s.paypal_configured:
            raise PayPalNotConfigured()
        with self._lock:
            if self._token and time.time() < self._token_exp - 60:
                return self._token
            basic = base64.b64encode(f"{self.s.paypal_client_id}:{self.s.paypal_client_secret}".encode()).decode()
            resp = self._send("POST", "/v1/oauth2/token", headers={"Authorization": f"Basic {basic}"}, data={"grant_type": "client_credentials"}, retry=True)
            body = resp.json()
            self._token = body["access_token"]
            self._token_exp = time.time() + int(body.get("expires_in", 300))
            return self._token

    # ---- transport with retry/backoff ----
    def _send(self, method: str, path: str, *, retry: bool, **kw: Any) -> httpx.Response:
        attempt = 0
        while True:
            try:
                resp = self._http.request(method, path, **kw)
            except httpx.HTTPError as e:
                if retry and attempt < self._max_retries:
                    self._sleep(0.5 * 2 ** attempt); attempt += 1; continue
                raise PayPalError(0, "NETWORK", f"could not reach PayPal ({type(e).__name__}).") from e
            if resp.status_code >= 500 or resp.status_code == 429:
                if retry and attempt < self._max_retries:
                    self._sleep(0.5 * 2 ** attempt); attempt += 1; continue
            if resp.status_code >= 400:
                raise self._to_error(resp)
            return resp

    @staticmethod
    def _to_error(resp: httpx.Response) -> PayPalError:
        try:
            b = resp.json()
        except ValueError:
            b = {}
        if not isinstance(b, dict):
            b = {}
        name = b.get("name") or b.get("error") or "UNKNOWN_ERROR"
        msg = b.get("message") or b.get("error_description") or f"request failed with status {resp.status_code}."
        issues = [{"issue": d.get("issue"), "description": d.get("description")} for d in b.get("details", []) if isinstance(d, dict)]
        return PayPalError(resp.status_code, str(name), str(msg), b.get("debug_id"), issues)

    def _call(self, method: str, path: str, *, json: Any = None, request_id: str | None = None, retry: bool = True) -> dict:
        headers = {"Authorization": f"Bearer {self._access_token()}", "Content-Type": "application/json", "Accept": "application/json"}
        if request_id:
            headers["PayPal-Request-Id"] = request_id
        resp = self._send(method, path, headers=headers, json=json, retry=retry)
        return resp.json() if resp.content else {}

    # ---- Orders v2 ----
    def create_order(self, *, amount: float, currency: str, reference_id: str, description: str, request_id: str,
                     return_url: str, cancel_url: str, brand_name: str = "PayPal AgentGuard", intent: str = "CAPTURE") -> OrderResult:
        payload = {
            "intent": intent.upper(),
            "purchase_units": [{
                "reference_id": reference_id[:256], "custom_id": reference_id[:127],
                "description": description[:127],
                "amount": {"currency_code": currency.upper(), "value": money(amount)},
            }],
            "payment_source": {"paypal": {"experience_context": {
                "brand_name": brand_name, "user_action": "PAY_NOW", "shipping_preference": "NO_SHIPPING",
                "return_url": return_url, "cancel_url": cancel_url,
            }}},
        }
        o = self._call("POST", "/v2/checkout/orders", json=payload, request_id=request_id)
        log.info("paypal order created id=%s status=%s", o.get("id"), o.get("status"))
        return OrderResult(id=o["id"], status=o.get("status", "CREATED"), approval_url=_approval_url(o), raw=o)

    def get_order(self, order_id: str) -> dict:
        return self._call("GET", f"/v2/checkout/orders/{order_id}")

    def capture_order(self, order_id: str, request_id: str) -> CaptureResult:
        try:
            o = self._call("POST", f"/v2/checkout/orders/{order_id}/capture", json={}, request_id=request_id)
        except PayPalError as e:
            if e.has_issue("ORDER_ALREADY_CAPTURED"):
                o = self.get_order(order_id)  # safe replay: report the real state instead of failing
            else:
                raise
        cap = _first_capture(o) or {}
        amt = cap.get("amount") or {}
        return CaptureResult(order_id=o.get("id", order_id), order_status=o.get("status", ""), capture_id=cap.get("id"),
                             capture_status=cap.get("status"), amount=amt.get("value"), currency=amt.get("currency_code"), raw=o)

    # ---- Vault v3 (agent wallet): setup token -> buyer consent -> payment token -> charge with vault_id, no redirect ----
    def create_setup_token(self, *, return_url: str, cancel_url: str, request_id: str, brand_name: str = "PayPal AgentGuard") -> dict:
        body = {"payment_source": {"paypal": {"usage_type": "MERCHANT", "usage_pattern": "IMMEDIATE", "permit_multiple_payment_tokens": False,
                                              "experience_context": {"brand_name": brand_name, "shipping_preference": "NO_SHIPPING",
                                                                     "return_url": return_url, "cancel_url": cancel_url}}}}
        return self._call("POST", "/v3/vault/setup-tokens", json=body, request_id=request_id)

    def create_payment_token(self, setup_token_id: str, request_id: str) -> dict:
        body = {"payment_source": {"token": {"id": setup_token_id, "type": "SETUP_TOKEN"}}}
        return self._call("POST", "/v3/vault/payment-tokens", json=body, request_id=request_id)

    def delete_payment_token(self, vault_id: str) -> None:
        self._call("DELETE", f"/v3/vault/payment-tokens/{vault_id}")

    def charge_vault(self, *, vault_id: str, amount: float, currency: str, reference_id: str, description: str, request_id: str) -> CaptureResult:
        """Create + capture an order with a vaulted PayPal account in one call. No buyer redirect."""
        payload = {
            "intent": "CAPTURE",
            "purchase_units": [{"reference_id": reference_id[:256], "custom_id": reference_id[:127], "description": description[:127],
                                "amount": {"currency_code": currency.upper(), "value": money(amount)}}],
            "payment_source": {"paypal": {"vault_id": vault_id, "stored_credential": {"payment_initiator": "MERCHANT", "usage": "SUBSEQUENT"}}},
        }
        o = self._call("POST", "/v2/checkout/orders", json=payload, request_id=request_id)
        cap = _first_capture(o) or {}
        amt = cap.get("amount") or {}
        return CaptureResult(order_id=o.get("id", ""), order_status=o.get("status", ""), capture_id=cap.get("id"), capture_status=cap.get("status"),
                             amount=amt.get("value"), currency=amt.get("currency_code"), raw=o)

    # ---- Orders v2: authorize, then Payments v2: capture / void / reauthorize ----
    def authorize_order(self, order_id: str, request_id: str) -> AuthorizationResult:
        try:
            o = self._call("POST", f"/v2/checkout/orders/{order_id}/authorize", json={}, request_id=request_id)
        except PayPalError as e:
            if e.has_issue("ORDER_ALREADY_AUTHORIZED"):
                o = self.get_order(order_id)  # safe replay: report the real state
            else:
                raise
        a = _first_authorization(o) or {}
        amt = a.get("amount") or {}
        return AuthorizationResult(order_id=o.get("id", order_id), order_status=o.get("status", ""), authorization_id=a.get("id"),
                                   status=a.get("status"), amount=amt.get("value"), currency=amt.get("currency_code"),
                                   expires_at=a.get("expiration_time"), raw=o)

    def get_authorization(self, authorization_id: str) -> dict:
        return self._call("GET", f"/v2/payments/authorizations/{authorization_id}")

    def capture_authorization(self, authorization_id: str, *, amount: float, currency: str, request_id: str, final_capture: bool = True) -> dict:
        body = {"amount": {"value": money(amount), "currency_code": currency.upper()}, "final_capture": final_capture}
        return self._call("POST", f"/v2/payments/authorizations/{authorization_id}/capture", json=body, request_id=request_id)

    def void_authorization(self, authorization_id: str, request_id: str) -> dict:
        return self._call("POST", f"/v2/payments/authorizations/{authorization_id}/void", request_id=request_id)

    def reauthorize(self, authorization_id: str, *, amount: float, currency: str, request_id: str) -> dict:
        body = {"amount": {"value": money(amount), "currency_code": currency.upper()}}
        return self._call("POST", f"/v2/payments/authorizations/{authorization_id}/reauthorize", json=body, request_id=request_id)

    def refund_capture(self, capture_id: str, *, request_id: str, amount: float | None = None, currency: str = "USD", note: str = "") -> dict:
        body: dict[str, Any] = {}
        if amount is not None:
            body["amount"] = {"value": money(amount), "currency_code": currency.upper()}
        if note:
            body["note_to_payer"] = note[:255]
        return self._call("POST", f"/v2/payments/captures/{capture_id}/refund", json=body, request_id=request_id)

    # ---- webhooks ----
    def verify_webhook(self, headers: dict[str, str], event: dict) -> bool:
        """True only if PayPal confirms the signature. Requires PAYPAL_WEBHOOK_ID."""
        if not self.s.paypal_webhook_id:
            raise AppError(503, "webhook_not_configured", "PAYPAL_WEBHOOK_ID is not set; webhook signatures cannot be verified.")
        h = {k.lower(): v for k, v in headers.items()}
        try:
            body = {"auth_algo": h["paypal-auth-algo"], "cert_url": h["paypal-cert-url"], "transmission_id": h["paypal-transmission-id"],
                    "transmission_sig": h["paypal-transmission-sig"], "transmission_time": h["paypal-transmission-time"],
                    "webhook_id": self.s.paypal_webhook_id, "webhook_event": event}
        except KeyError:
            return False
        r = self._call("POST", "/v1/notifications/verify-webhook-signature", json=body)
        return r.get("verification_status") == "SUCCESS"

    def close(self) -> None:
        self._http.close()


_client: PayPalClient | None = None


def get_paypal_client() -> PayPalClient:
    """FastAPI dependency; tests override it."""
    global _client
    if _client is None:
        _client = PayPalClient()
    return _client
