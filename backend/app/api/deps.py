from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.database.session import get_db
from app.models import User

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise AppError(401, "unauthenticated", "Sign in to continue.")
    user_id = decode_access_token(creds.credentials)
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise AppError(401, "unauthenticated", "Your session is invalid or has expired.")
    return user
