import uuid

import pytest
from sqlalchemy import text

from app.core.database import engine
from app.core.rate_limit import RateLimit

PASSWORD = "correct horse battery"


def database_ready():
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT count(*) FROM known_interactions")).scalar() > 0
    except Exception:
        return False


requires_db = pytest.mark.skipif(not database_ready(), reason="needs the seeded PostgreSQL database")


def new_email():
    return f"test-{uuid.uuid4().hex[:10]}@example.com"


def sign_up(client, email=None):
    email = email or new_email()
    response = client.post("/api/v1/auth/register",
                           json={"email": email, "password": PASSWORD, "accept_history": True})
    assert response.status_code == 201, response.text
    return email


@pytest.fixture(autouse=True)
def fresh_rate_limits():
    # Every TestClient request comes from the same address, so tests would share one count otherwise.
    RateLimit.hits.clear()
