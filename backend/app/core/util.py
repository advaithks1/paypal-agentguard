import uuid
from datetime import datetime, timezone


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:16]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    """Serialize as ISO-8601 UTC (SQLite drops tzinfo, so re-attach it)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def naive_utcnow() -> datetime:
    """SQLite stores naive UTC; use this for comparisons against stored columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
