import os

os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123")
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["PAYPAL_CLIENT_ID"] = ""
os.environ["PAYPAL_CLIENT_SECRET"] = ""
os.environ["GEMINI_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.database.session import Base, get_db, make_engine
from app.main import create_app


@pytest.fixture()
def db_session():
    engine = make_engine("sqlite:///:memory:")
    from app import models  # noqa: F401
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture()
def client(db_session):
    app = create_app()

    def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:  # runs lifespan (seeds the real engine's in-memory DB; harmless)
        yield c


@pytest.fixture()
def auth_headers(client):
    r = client.post("/api/v1/auth/register", json={"email": "alex@example.com", "password": "correct-horse", "full_name": "Alex Doe"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
