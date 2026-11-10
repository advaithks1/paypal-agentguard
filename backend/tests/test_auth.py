from sqlalchemy import select

from app.models import AuditLog, Policy, User

API = "/api/v1"


def test_register_creates_user_policy_and_audit(client, db_session):
    r = client.post(f"{API}/auth/register", json={"email": "Alex@Example.com", "password": "correct-horse", "full_name": "  Alex Doe "})
    assert r.status_code == 201
    body = r.json()
    assert body["token_type"] == "bearer" and body["access_token"]
    assert body["user"]["email"] == "alex@example.com"  # normalized
    assert body["user"]["full_name"] == "Alex Doe"
    assert "password" not in str(body)
    user = db_session.scalar(select(User))
    assert user.password_hash != "correct-horse"
    pol = db_session.scalar(select(Policy).where(Policy.user_id == user.id))
    assert pol is not None and "Amazon" in pol.approved_merchants and "LuxWatchOutlet" in pol.restricted_merchants
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "user.registered"))


def test_register_duplicate_email_conflict(client):
    payload = {"email": "a@b.com", "password": "longenough1", "full_name": "A"}
    assert client.post(f"{API}/auth/register", json=payload).status_code == 201
    r = client.post(f"{API}/auth/register", json={**payload, "email": "A@B.COM"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "email_taken"


def test_register_validation_error_format(client):
    r = client.post(f"{API}/auth/register", json={"email": "nope", "password": "short", "full_name": ""})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error"
    fields = {d["field"] for d in err["details"]}
    assert {"email", "password", "full_name"} <= fields


def test_login_success_and_me(client, auth_headers):
    r = client.post(f"{API}/auth/login", json={"email": "alex@example.com", "password": "correct-horse"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["email"] == "alex@example.com"


def test_login_wrong_password_and_unknown_email_same_error(client, auth_headers):
    bad_pw = client.post(f"{API}/auth/login", json={"email": "alex@example.com", "password": "wrong-password"})
    unknown = client.post(f"{API}/auth/login", json={"email": "ghost@example.com", "password": "wrong-password"})
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json() == unknown.json()
    assert bad_pw.json()["error"]["code"] == "invalid_credentials"


def test_me_requires_valid_token(client):
    assert client.get(f"{API}/auth/me").status_code == 401
    r = client.get(f"{API}/auth/me", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthenticated"
