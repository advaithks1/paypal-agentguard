from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Public. Reports which integrations are configured (never the secrets themselves)."""
    s = get_settings()
    return {
        "status": "ok",
        "paypal_configured": s.paypal_configured,
        "paypal_mode": "sandbox" if "sandbox" in s.paypal_base_url else "live",
        "paypal_webhook_verification": bool(s.paypal_webhook_id),
        "gemini_configured": s.gemini_configured,
        "gemini_model": s.gemini_model,
    }
