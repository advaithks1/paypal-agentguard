"""Password hashing (bcrypt) and JWT helpers."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings

MAX_PASSWORD_BYTES = 72  # bcrypt limit


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")[:MAX_PASSWORD_BYTES]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:MAX_PASSWORD_BYTES], hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=s.access_token_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


AGENT_KEY_PREFIX = "agk_"


def generate_agent_key() -> tuple[str, str, str]:
    """Return (full_key, prefix, sha256_hash). The full key is shown to the user once and never stored."""
    key = AGENT_KEY_PREFIX + secrets.token_urlsafe(32)
    return key, key[:12], hash_agent_key(key)


def hash_agent_key(key: str) -> str:
    # Keys are 256-bit random values, so a fast hash is appropriate (bcrypt is for low-entropy passwords).
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def agent_key_matches(key: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_agent_key(key), stored_hash)
