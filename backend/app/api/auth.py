from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.core.util import iso
from app.database.session import get_db
from app.models import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserOut
from app.services import audit
from app.services.seed import default_policy_for, seed_merchants

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, full_name=u.full_name, created_at=iso(u.created_at) or "")


def _session(u: User) -> AuthResponse:
    return AuthResponse(access_token=create_access_token(u.id), user=user_out(u))


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AppError(409, "email_taken", "An account with this email already exists.")
    user = User(email=email, full_name=body.full_name, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    seed_merchants(db)  # no-op if already seeded
    default_policy_for(user.id, db)
    audit.record(db, actor=user.id, user_id=user.id, action="user.registered", entity_type="user",
                 entity_id=user.id, detail="Account created with default spending policy.")
    db.commit()
    return _session(user)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Same message for unknown email and wrong password (no account enumeration).
    if user is None or not verify_password(body.password, user.password_hash):
        raise AppError(401, "invalid_credentials", "Incorrect email or password.")
    audit.record(db, actor=user.id, user_id=user.id, action="user.login", entity_type="user", entity_id=user.id)
    db.commit()
    return _session(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return user_out(user)
