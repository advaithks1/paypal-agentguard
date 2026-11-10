"""Seed merchants and default policy. Run: python -m app.services.seed"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.util import utcnow
from app.database.session import SessionLocal, init_db
from app.models import Merchant, Policy

# Mirrors the frontend demo merchants so UI and backend agree. Fictional trust scores for the hackathon.
MERCHANTS = [
    ("Amazon Web Services", "Cloud infrastructure", "trusted", 96, 2000, 10000),
    ("Amazon", "Marketplace", "trusted", 92, 500, 3000),
    ("Apple", "Electronics", "trusted", 95, 1500, 5000),
    ("Notion Labs", "Software subscriptions", "trusted", 93, 500, 2000),
    ("Figma", "Software subscriptions", "trusted", 94, 500, 2000),
    ("DigitalOcean", "Cloud infrastructure", "trusted", 91, 1000, 5000),
    ("Staples", "Office supplies", "trusted", 88, 800, 3000),
    ("Google Workspace", "Software subscriptions", "trusted", 97, 1500, 6000),
    ("Zoom", "Software subscriptions", "trusted", 90, 400, 1500),
    ("Canva", "Design", "trusted", 89, 300, 1200),
    ("Amazon Business", "Procurement", "trusted", 85, 1500, 6000),
    ("NovaDeals Marketplace", "Marketplace", "unreviewed", 48, None, None),
    ("QuickGiftCards.io", "Gift cards", "restricted", 22, 0, 0),
    ("LuxWatchOutlet", "Luxury goods", "restricted", 18, 0, 0),
]


def seed_merchants(db: Session) -> int:
    existing = {n for (n,) in db.execute(select(Merchant.name))}
    added = 0
    for name, cat, status, trust, per_tx, monthly in MERCHANTS:
        if name in existing:
            continue
        db.add(Merchant(name=name, category=cat, status=status, trust_score=trust,
                        per_transaction_limit=per_tx, monthly_limit=monthly, currency="USD"))
        added += 1
    db.commit()
    return added


def default_policy_for(user_id: str, db: Session) -> Policy:
    """Create the default policy for a user (idempotent)."""
    existing = db.scalar(select(Policy).where(Policy.user_id == user_id))
    if existing:
        return existing
    trusted = [n for (n,) in db.execute(select(Merchant.name).where(Merchant.status == "trusted").order_by(Merchant.name))]
    restricted = [n for (n,) in db.execute(select(Merchant.name).where(Merchant.status == "restricted").order_by(Merchant.name))]
    policy = Policy(
        user_id=user_id, max_auto_amount=50.0, max_transaction_amount=300.0, daily_limit=500.0,
        manual_approval_threshold=50.0, allowed_currencies=["USD"], approved_merchants=trusted,
        restricted_merchants=restricted, duplicate_protection=True, duplicate_window_minutes=60,
        updated_at=utcnow(),
    )
    db.add(policy)
    db.commit()
    return policy


def main() -> None:
    init_db()
    with SessionLocal() as db:
        n = seed_merchants(db)
        print(f"Seeded {n} new merchants ({len(MERCHANTS)} total defined).")


if __name__ == "__main__":
    main()
