import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import INSECURE_DEFAULT_SECRET, get_settings
from app.core.errors import register_error_handlers
from app.database.session import SessionLocal, init_db
from app.services.seed import seed_merchants

log = logging.getLogger("agentguard")


@asynccontextmanager
async def lifespan(_: FastAPI):
    s = get_settings()
    if s.jwt_secret == INSECURE_DEFAULT_SECRET:
        log.warning("JWT_SECRET is the insecure default. Set a long random value in backend/.env.")
    if not s.paypal_configured:
        log.warning("PayPal credentials missing: payment endpoints will return 503 until set.")
    if not s.gemini_configured:
        log.warning("GEMINI_API_KEY missing: agents will use rule-based fallbacks.")
    init_db()
    with SessionLocal() as db:
        seed_merchants(db)
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="PayPal AgentGuard API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(api_router, prefix=s.api_prefix)
    return app


app = create_app()
