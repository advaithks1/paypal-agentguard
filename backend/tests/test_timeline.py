"""Phase 4: per-transaction timeline, PayPal webhook events, simulator, narration. Written without being run: see HANDOFF.md."""
from app.agents import narrator
from app.agents.gemini import get_gemini_client
from app.core.config import get_settings
from tests.test_agents import gem
from tests.test_authorize import A, HDR, api, approve, hold, needs_approval_request  # noqa: F401  (api is a fixture)


def tx_id(api, pr):
    items = api.get(f"{A}/transactions").json()["items"]
    return [t["id"] for t in items if t["purchase_request_id"] == pr["id"]][0]


def timeline(api, tid):
    r = api.get(f"{A}/transactions/{tid}/timeline")
    assert r.status_code == 200, r.text
    return r.json()


def test_timeline_order_sources_and_live_flag(api):
    pr = needs_approval_request(api)
    tid = tx_id(api, pr)
    t0 = timeline(api, tid)
    assert [e["kind"] for e in t0["events"][:2]] == ["purchase_request.created", "policy.needs_approval"] and t0["live"] is True
    p = hold(api, pr)
    approve(api, pr)
    assert api.post(f"{A}/payments/{p['id']}/capture-authorization", json={}).status_code == 200
    t = timeline(api, tid)
    kinds = [e["kind"] for e in t["events"]]
    for k in ("purchase_request.created", "policy.needs_approval", "payment.order_created", "payment.authorized", "approval.approved", "payment.captured"):
        assert k in kinds, kinds
    assert kinds.index("payment.authorized") < kinds.index("approval.approved") < kinds.index("payment.captured")
    ats = [e["at"] for e in t["events"]]
    assert ats == sorted(ats)
    assert all(e["source"] == "AgentGuard" for e in t["events"]) and t["live"] is False and t["payment_status"] == "captured"
    cap = [e for e in t["events"] if e["kind"] == "payment.captured"][0]
    assert cap["paypal_ids"].get("order_id") == "ORD1"


def test_webhook_events_are_stored_highlighted_and_deduplicated(api):
    pr = needs_approval_request(api)
    tid = tx_id(api, pr)
    hold(api, pr)
    ev = {"id": "EVT-A1", "event_type": "PAYMENT.AUTHORIZATION.CREATED", "resource": {"id": "AUTH1"}}
    for _ in range(3):  # PayPal re-delivers
        assert api.post(f"{A}/payments/webhook", json=ev, headers=HDR).json() == {"handled": True}
    hooks = [e for e in timeline(api, tid)["events"] if e["source"] == "PayPal webhook"]
    assert len(hooks) == 1
    h = hooks[0]
    assert h["highlight"] is True and h["verified"] is True and h["simulated"] is False and h["paypal_ids"]["event_id"] == "EVT-A1" and h["paypal_ids"]["authorization_id"] == "AUTH1"


def test_unverified_webhook_never_reaches_timeline(api):
    pr = needs_approval_request(api)
    tid = tx_id(api, pr)
    hold(api, pr)
    api.paypal({("POST", "/v1/notifications/verify-webhook-signature"): {"verification_status": "FAILURE"}})
    r = api.post(f"{A}/payments/webhook", json={"id": "EVT-BAD", "event_type": "PAYMENT.CAPTURE.COMPLETED", "resource": {"id": "C", "supplementary_data": {"related_ids": {"order_id": "ORD1"}}}}, headers=HDR)
    assert r.status_code == 400
    assert not [e for e in timeline(api, tid)["events"] if e["source"] == "PayPal webhook"]


def test_simulator_is_labelled_and_never_changes_payment_state(api):
    pr = needs_approval_request(api)
    tid = tx_id(api, pr)
    p = hold(api, pr)
    r = api.post(f"{A}/transactions/{tid}/simulate-webhook", json={"event_type": "PAYMENT.CAPTURE.COMPLETED"})
    assert r.status_code == 200, r.text
    sim = [e for e in r.json()["events"] if e["simulated"]]
    assert len(sim) == 1 and sim[0]["verified"] is False and "(simulated)" in sim[0]["title"] and sim[0]["highlight"] is False
    assert api.get(f"{A}/payments/by-request/{pr['id']}").json()["status"] == "authorized" and p["status"] == "authorized"
    assert api.post(f"{A}/transactions/{tid}/simulate-webhook", json={"event_type": "PAYMENT.CAPTURE.REFUNDED"}).status_code == 422


def test_simulator_needs_a_payment_and_sandbox(api, monkeypatch):
    pr = needs_approval_request(api)
    tid = tx_id(api, pr)
    assert api.post(f"{A}/transactions/{tid}/simulate-webhook", json={"event_type": "CHECKOUT.ORDER.APPROVED"}).status_code == 409
    monkeypatch.setattr(get_settings(), "paypal_base_url", "https://api-m.paypal.com")
    assert api.post(f"{A}/transactions/{tid}/simulate-webhook", json={"event_type": "CHECKOUT.ORDER.APPROVED"}).status_code == 403


def test_timeline_is_private_to_the_owner(api):
    pr = needs_approval_request(api)
    tid = tx_id(api, pr)
    assert api.get(f"{A}/transactions/nope/timeline").status_code == 404
    other = api.post(f"{A}/auth/register", json={"email": "eve@example.com", "password": "correct-horse", "full_name": "Eve"}).json()["access_token"]
    r = api.get(f"{A}/transactions/{tid}/timeline", headers={"Authorization": f"Bearer {other}"})
    assert r.status_code == 404


def test_narration_falls_back_to_rules_and_is_labelled(api):
    pr = needs_approval_request(api)
    tid = tx_id(api, pr)
    hold(api, pr)
    r = api.post(f"{A}/transactions/{tid}/narrate")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["source"] == "rule_based" and b["source_label"] == "rules" and "Figma" in b["narration"] and "nothing is charged" in b["narration"]


def test_narration_uses_gemini_when_consistent_and_rejects_false_claims(api):
    pr = needs_approval_request(api)
    tid = tx_id(api, pr)
    hold(api, pr)
    ok = "The request was held for your approval and PayPal is only holding the funds. Nothing has been charged yet."
    api.app.dependency_overrides[get_gemini_client] = lambda: gem({"narration": ok})
    b = api.post(f"{A}/transactions/{tid}/narrate").json()
    assert b["source"] == "gemini" and b["source_label"] == "Gemini" and b["narration"] == ok
    api.app.dependency_overrides[get_gemini_client] = lambda: gem({"narration": "The payment was charged to your account."})  # false: only authorized
    b = api.post(f"{A}/transactions/{tid}/narrate").json()
    assert b["source"] == "rule_based"


def test_narrator_consistency_and_empty_fallback():
    assert narrator.consistent("captured", "The money was charged.") and not narrator.consistent("captured", "Nothing was charged.")
    assert narrator.consistent("authorized", "Nothing has been charged yet.") and not narrator.consistent("authorized", "It was charged.")
    text, src = narrator.narrate([], "Figma", 10.0, "USD", "not_started", None)
    assert src == "rule_based" and "No events" in text
