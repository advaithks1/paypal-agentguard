from sqlalchemy import select

from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.models import Merchant
from app.services.seed import MERCHANTS, default_policy_for, seed_merchants

API = "/api/v1"


def test_health_reports_config_without_secrets(client):
    r = client.get(f"{API}/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["paypal_configured"] is False and body["gemini_configured"] is False
    assert body["paypal_mode"] == "sandbox"
    assert "secret" not in str(body).lower()


def test_unknown_route_uses_error_format(client):
    r = client.get(f"{API}/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_cors_allows_frontend_origin(client):
    r = client.options(f"{API}/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_password_hash_roundtrip_and_long_password():
    h = hash_password("s3cret-pass")
    assert verify_password("s3cret-pass", h) and not verify_password("other", h)
    long_pw = "x" * 200  # beyond bcrypt's 72 byte limit must not crash
    assert verify_password(long_pw, hash_password(long_pw))
    assert verify_password("x", "not-a-hash") is False


def test_jwt_roundtrip_and_tamper():
    tok = create_access_token("usr_1")
    assert decode_access_token(tok) == "usr_1"
    assert decode_access_token(tok + "x") is None


def test_seed_is_idempotent(db_session):
    assert seed_merchants(db_session) == len(MERCHANTS)
    assert seed_merchants(db_session) == 0
    assert db_session.scalar(select(Merchant).where(Merchant.name == "QuickGiftCards.io")).status == "restricted"


def test_default_policy_is_idempotent(db_session):
    from app.models import User
    u = User(email="x@y.com", full_name="X", password_hash="h")
    db_session.add(u)
    db_session.commit()
    seed_merchants(db_session)
    p1 = default_policy_for(u.id, db_session)
    p2 = default_policy_for(u.id, db_session)
    assert p1.id == p2.id
