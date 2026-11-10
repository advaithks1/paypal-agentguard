"""Append-only audit trail helper. Callers own the commit."""
from sqlalchemy.orm import Session

from app.models import AuditLog


def record(db: Session, *, actor: str, action: str, entity_type: str, entity_id: str | None = None,
           detail: str = "", user_id: str | None = None, data_source: str = "backend") -> AuditLog:
    entry = AuditLog(user_id=user_id, actor=actor, action=action, entity_type=entity_type,
                     entity_id=entity_id, detail=detail[:2000], data_source=data_source)
    db.add(entry)
    return entry
