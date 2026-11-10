import json

import httpx
import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.core.errors import AppError
from app.integrations.paypal import PayPalClient, PayPalError, PayPalNotConfigured, money, payment_status_from_capture, status_from_webhook_event
from app.models import AuditLog, Payment, PurchaseRequest, Transaction, User
from app.services import payments

SETTINGS = Settings(paypal_client_id="cid", paypal_client_secret="sec", paypal_base_url="https://api-m.sandbox.paypal.com", paypal_webhook_id="WH-1", _env_file=None)


class Fake:
    """Programmable PayPal. routes: (METHOD, path) -> response or list of responses (consumed in order)."""
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content) if req.content and req.headers.get("content-type", "").startswith("application/json") else None
        self.calls.append((req.method, req.url.path, dict(req.headers), body))
        r = self.routes.get((req.method, req.url.path))
        if r is None:
            return httpx.Response(404, json={"name": "RESOURCE_NOT_FOUND", "message": "nope"})
        if isinstance(r, list):
            r = r.pop(0) if len(r) > 1 else r[0]
        return r if isinstance(r, httpx.Response) else httpx.Response(200, json=r)

    def count(self, method, path):
        return sum(1 for c in self.calls if c[0] == method and c[1] == path)


TOKEN = {"access_token": "tok-1", "expires_in": 3600}
ORDER_CREATED = {"id": "ORD1", "status": "PAYER_ACTION_REQUIRED", "links": [{"rel": "self", "href": "x"}, {"rel": "payer-action", "href": "https://www.sandbox.paypal.com/checkoutnow?token=ORD1"}]}


def capture_body(status="COMPLETED", value="45.00", cur="USD"):
    return {"id": "ORD1", "status": "COMPLETED", "purchase_units": [{"payments": {"captures": [{"id": "CAP1", "status": status, "amount": {"value": value, "currency_code": cur}}]}}]}


def make_client(routes):
    fake = Fake({("POST", "/v1/oauth2/token"): TOKEN, **routes})
    return PayPalClient(SETTINGS, transport=httpx.MockTransport(fake), sleep=lambda s: None), fake


def test_money_formatting():
    assert money(12.5) == "12.50" and money(0.1 + 0.2) == "0.30" and money(19.999) == "20.00" and money(5) == "5.00"


def test_not_configured_raises_503():
    c = PayPalClient(Settings(paypal_client_id="", paypal_client_secret="", _env_file=None), transport=httpx.MockTransport(Fake({})))
    with pytest.raises(PayPalNotConfigured) as e:
        c.create_order(amount=1, currency="USD", reference_id="r", description="d", request_id="x", return_url="u", cancel_url="c")
    assert e.value.status == 503


def test_create_order_payload_headers_and_approval_url():
    c, fake = make_client({("POST", "/v2/checkout/orders"): ORDER_CREATED})
    o = c.create_order(amount=45, currency="usd", reference_id="pr_1", description="USB hub", request_id="rid-1", return_url="http://r", cancel_url="http://c")
    assert o.id == "ORD1" and o.approval_url.endswith("token=ORD1")
    _, _, headers, body = fake.calls[-1]
    assert headers["paypal-request-id"] == "rid-1" and headers["authorization"] == "Bearer tok-1"
    assert body["intent"] == "CAPTURE" and body["purchase_units"][0]["amount"] == {"currency_code": "USD", "value": "45.00"}
    ctx = body["payment_source"]["paypal"]["experience_context"]
    assert ctx["return_url"] == "http://r" and ctx["cancel_url"] == "http://c" and ctx["user_action"] == "PAY_NOW"
    basic = fake.calls[0][2]["authorization"]
    assert basic.startswith("Basic ")


def test_token_is_cached_across_calls():
    c, fake = make_client({("GET", "/v2/checkout/orders/ORD1"): {"id": "ORD1", "status": "APPROVED"}})
    c.get_order("ORD1"); c.get_order("ORD1")
    assert fake.count("POST", "/v1/oauth2/token") == 1


def test_expired_token_is_refreshed(monkeypatch):
    c, fake = make_client({("GET", "/v2/checkout/orders/ORD1"): {"id": "ORD1"}})
    c.get_order("ORD1")
    c._token_exp = 0
    c.get_order("ORD1")
    assert fake.count("POST", "/v1/oauth2/token") == 2


def test_retry_on_5xx_then_success_and_exhaustion():
    flaky = [httpx.Response(503, json={"name": "SERVICE_UNAVAILABLE", "message": "busy"}), httpx.Response(200, json=ORDER_CREATED)]
    c, fake = make_client({("POST", "/v2/checkout/orders"): flaky})
    assert c.create_order(amount=1, currency="USD", reference_id="r", description="d", request_id="x", return_url="u", cancel_url="c").id == "ORD1"
    assert fake.count("POST", "/v2/checkout/orders") == 2
    down = httpx.Response(500, json={"name": "INTERNAL", "message": "boom", "debug_id": "dbg"})
    c2, f2 = make_client({("POST", "/v2/checkout/orders"): down})
    with pytest.raises(PayPalError) as e:
        c2.create_order(amount=1, currency="USD", reference_id="r", description="d", request_id="x", return_url="u", cancel_url="c")
    assert e.value.status == 502 and e.value.debug_id == "dbg" and f2.count("POST", "/v2/checkout/orders") == 3


def test_4xx_is_not_retried_and_maps_issue():
    bad = httpx.Response(422, json={"name": "UNPROCESSABLE_ENTITY", "message": "bad", "debug_id": "d1", "details": [{"issue": "INVALID_CURRENCY_CODE", "description": "x"}]})
    c, fake = make_client({("POST", "/v2/checkout/orders"): bad})
    with pytest.raises(PayPalError) as e:
        c.create_order(amount=1, currency="XXX", reference_id="r", description="d", request_id="x", return_url="u", cancel_url="c")
    assert e.value.status == 400 and e.value.has_issue("INVALID_CURRENCY_CODE") and fake.count("POST", "/v2/checkout/orders") == 1
    assert "sec" not in json.dumps(e.value.details)


def test_network_error_maps_to_unreachable():
    def boom(_):
        raise httpx.ConnectError("down")
    c = PayPalClient(SETTINGS, transport=httpx.MockTransport(boom), sleep=lambda s: None)
    with pytest.raises(PayPalError) as e:
        c.get_order("X")
    assert e.value.code == "paypal_unreachable" and e.value.status == 502


def test_bad_credentials_map_to_502():
    c, _ = make_client({("POST", "/v1/oauth2/token"): httpx.Response(401, json={"error": "invalid_client", "error_description": "Client Authentication failed"})})
    with pytest.raises(PayPalError) as e:
        c.get_order("X")
    assert e.value.status == 502 and "Client Authentication failed" in e.value.message


def test_capture_parses_and_already_captured_replays_safely():
    c, _ = make_client({("POST", "/v2/checkout/orders/ORD1/capture"): capture_body()})
    r = c.capture_order("ORD1", "rid-cap")
    assert (r.capture_id, r.capture_status, r.amount) == ("CAP1", "COMPLETED", "45.00")
    already = httpx.Response(422, json={"name": "UNPROCESSABLE_ENTITY", "message": "x", "details": [{"issue": "ORDER_ALREADY_CAPTURED"}]})
    c2, _ = make_client({("POST", "/v2/checkout/orders/ORD1/capture"): already, ("GET", "/v2/checkout/orders/ORD1"): capture_body()})
    assert c2.capture_order("ORD1", "rid").capture_id == "CAP1"


def test_refund_request_shape():
    c, fake = make_client({("POST", "/v2/payments/captures/CAP1/refund"): {"id": "REF1", "status": "COMPLETED"}})
    assert c.refund_capture("CAP1", request_id="r-1", amount=10, currency="USD", note="n")["id"] == "REF1"
    assert fake.calls[-1][3]["amount"] == {"value": "10.00", "currency_code": "USD"}


def test_webhook_verification():
    event = {"id": "WH-EVT", "event_type": "PAYMENT.CAPTURE.COMPLETED"}
    hdrs = {"PAYPAL-AUTH-ALGO": "a", "PAYPAL-CERT-URL": "u", "PAYPAL-TRANSMISSION-ID": "t", "PAYPAL-TRANSMISSION-SIG": "s", "PAYPAL-TRANSMISSION-TIME": "tm"}
    ok, fake = make_client({("POST", "/v1/notifications/verify-webhook-signature"): {"verification_status": "SUCCESS"}})
    assert ok.verify_webhook(hdrs, event) is True and fake.calls[-1][3]["webhook_id"] == "WH-1"
    bad, _ = make_client({("POST", "/v1/notifications/verify-webhook-signature"): {"verification_status": "FAILURE"}})
    assert bad.verify_webhook(hdrs, event) is False
    assert bad.verify_webhook({}, event) is False  # missing headers
    nowh = PayPalClient(Settings(paypal_client_id="c", paypal_client_secret="s", _env_file=None), transport=httpx.MockTransport(Fake({})))
    with pytest.raises(AppError) as e:
        nowh.verify_webhook(hdrs, event)
    assert e.value.code == "webhook_not_configured"


def test_status_mappers():
    assert payment_status_from_capture("COMPLETED", "COMPLETED") == "captured"
    assert payment_status_from_capture("COMPLETED", "DECLINED") == "failed"
    assert payment_status_from_capture("APPROVED", None) == "buyer_approved"
    assert status_from_webhook_event("PAYMENT.CAPTURE.REFUNDED") == "refunded" and status_from_webhook_event("X") is None


# ---------- service layer ----------
@pytest.fixture()
def world(db_session):
    u = User(email="a@b.com", full_name="A", password_hash="h")
    other = User(email="o@b.com", full_name="O", password_hash="h")
    db_session.add_all([u, other]); db_session.commit()
    def pr(decision="auto_approved", approval="not_required", status="approved", amount=45.0):
        p = PurchaseRequest(user_id=u.id, item="USB hub", merchant="Amazon", amount=amount, currency="USD", status=status, approval_status=approval,
                            policy_evaluation={"decision": decision}, risk_assessment={"score": 10, "category": "low"})
        db_session.add(p); db_session.commit(); return p
    return u, other, pr


def standard_routes(cap=None):
    return {("POST", "/v2/checkout/orders"): ORDER_CREATED, ("POST", "/v2/checkout/orders/ORD1/capture"): cap or capture_body(),
            ("POST", "/v2/payments/captures/CAP1/refund"): {"id": "REF1", "status": "COMPLETED"}}


def test_full_happy_path_create_capture_refund(db_session, world):
    u, _, mk = world
    pr = mk()
    c, fake = make_client(standard_routes())
    p = payments.create_order(db_session, c, u, pr, "http://r", "http://c")
    assert p.status == "order_created" and p.approval_url and p.data_source == "paypal_sandbox" and pr.payment_status == "order_created"
    assert payments.create_order(db_session, c, u, pr, "http://r", "http://c").id == p.id  # idempotent reuse
    assert fake.count("POST", "/v2/checkout/orders") == 1
    p = payments.capture(db_session, c, u, "ORD1")
    assert p.status == "captured" and p.paypal_capture_id == "CAP1" and pr.status == "paid" and p.captured_at
    assert payments.capture(db_session, c, u, "ORD1").status == "captured" and fake.count("POST", "/v2/checkout/orders/ORD1/capture") == 1
    tx = db_session.scalar(select(Transaction).where(Transaction.purchase_request_id == pr.id))
    assert tx.paypal_order_id == "ORD1" and tx.payment_status == "captured" and tx.data_source == "paypal_sandbox"
    p = payments.refund(db_session, c, u, p.id)
    assert p.status == "refunded" and tx.payment_status == "refunded"
    actions = [a.action for a in db_session.scalars(select(AuditLog).order_by(AuditLog.created_at))]
    assert {"payment.order_created", "payment.captured", "payment.refund"} <= set(actions)


def test_blocked_and_unapproved_requests_never_reach_paypal(db_session, world):
    u, other, mk = world
    c, fake = make_client(standard_routes())
    for pr, code in [(mk("blocked", status="blocked"), "not_payable"), (mk("needs_approval", "pending", "pending_approval"), "approval_required"),
                     (mk("needs_approval", "rejected", "rejected"), "not_payable")]:
        with pytest.raises(AppError) as e:
            payments.create_order(db_session, c, u, pr, "r", "c", intent="capture")  # explicit CAPTURE before approval is refused
        assert e.value.code == code
    with pytest.raises(AppError) as e:
        payments.create_order(db_session, c, other, mk(), "r", "c")  # someone else's request
    assert e.value.status == 404
    assert fake.count("POST", "/v2/checkout/orders") == 0


def test_needs_approval_after_human_approval_is_payable(db_session, world):
    u, _, mk = world
    c, _ = make_client(standard_routes())
    assert payments.create_order(db_session, c, u, mk("needs_approval", "approved", "approved"), "r", "c").status == "order_created"


def test_declined_capture_marks_failed(db_session, world):
    u, _, mk = world
    pr = mk(); c, _ = make_client(standard_routes(capture_body("DECLINED")))
    payments.create_order(db_session, c, u, pr, "r", "c")
    p = payments.capture(db_session, c, u, "ORD1")
    assert p.status == "failed" and pr.status == "failed" and p.captured_at is None


def test_capture_amount_mismatch_is_audited(db_session, world):
    u, _, mk = world
    pr = mk(); c, _ = make_client(standard_routes(capture_body(value="1.00")))
    payments.create_order(db_session, c, u, pr, "r", "c"); payments.capture(db_session, c, u, "ORD1")
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "payment.amount_mismatch"))


def test_capture_other_users_order_404(db_session, world):
    u, other, mk = world
    c, _ = make_client(standard_routes()); payments.create_order(db_session, c, u, mk(), "r", "c")
    with pytest.raises(AppError) as e:
        payments.capture(db_session, c, other, "ORD1")
    assert e.value.status == 404


def test_refund_guards(db_session, world):
    u, _, mk = world
    pr = mk(); c, _ = make_client(standard_routes())
    p = payments.create_order(db_session, c, u, pr, "r", "c")
    with pytest.raises(AppError) as e:
        payments.refund(db_session, c, u, p.id)  # not captured yet
    assert e.value.code == "not_refundable"
    payments.capture(db_session, c, u, "ORD1")
    with pytest.raises(AppError) as e:
        payments.refund(db_session, c, u, p.id, amount=999)
    assert e.value.code == "invalid_amount"
    assert payments.refund(db_session, c, u, p.id, amount=10).status == "captured"  # partial refund keeps captured


def test_void_open_order_only(db_session, world):
    u, _, mk = world
    pr = mk(); c, _ = make_client(standard_routes())
    p = payments.create_order(db_session, c, u, pr, "r", "c")
    assert payments.void_order(db_session, u, p.id).status == "voided"
    with pytest.raises(AppError):
        payments.capture(db_session, c, u, "ORD1")
    with pytest.raises(AppError):
        payments.void_order(db_session, u, p.id)


def test_webhook_updates_idempotently_and_never_regresses(db_session, world):
    u, _, mk = world
    pr = mk(); c, _ = make_client(standard_routes())
    p = payments.create_order(db_session, c, u, pr, "r", "c")
    approved = {"id": "EVT-1", "event_type": "CHECKOUT.ORDER.APPROVED", "resource": {"id": "ORD1"}}
    assert payments.apply_webhook_event(db_session, approved) and p.status == "buyer_approved"
    done = {"id": "EVT-2", "event_type": "PAYMENT.CAPTURE.COMPLETED", "resource": {"id": "CAP1", "supplementary_data": {"related_ids": {"order_id": "ORD1"}}}}
    assert payments.apply_webhook_event(db_session, done) and p.status == "captured" and pr.status == "paid" and p.paypal_capture_id == "CAP1"
    payments.apply_webhook_event(db_session, {**approved, "id": "EVT-3"})  # late, out-of-order event
    assert p.status == "captured"
    n = len(db_session.scalars(select(AuditLog).where(AuditLog.action == "paypal.webhook")).all())
    assert payments.apply_webhook_event(db_session, done) is True  # duplicate delivery
    assert len(db_session.scalars(select(AuditLog).where(AuditLog.action == "paypal.webhook")).all()) == n
    assert payments.apply_webhook_event(db_session, {"id": "E", "event_type": "SOMETHING.ELSE", "resource": {}}) is False
    assert payments.apply_webhook_event(db_session, {"id": "E9", "event_type": "CHECKOUT.ORDER.APPROVED", "resource": {"id": "UNKNOWN"}}) is False
