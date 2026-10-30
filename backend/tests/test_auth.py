from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.main import app
from app.models.tables import SavedCheck, User
from conftest import PASSWORD, new_email, requires_db, sign_up

pytestmark = requires_db

WARFARIN, ASPIRIN, SILDENAFIL = "pg_000472", "pg_000702", "pg_000051"


def account():
    client = TestClient(app)
    return client, sign_up(client)


def login(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_register_signs_in_and_never_stores_the_password():
    client, email = account()
    assert client.get("/api/v1/auth/me").json()["email"] == email
    with SessionLocal() as db:
        stored = db.scalar(select(User.password_hash).where(User.email == email))
    assert stored.startswith("scrypt$") and PASSWORD not in stored
    client.delete("/api/v1/auth/me")


def test_session_cookie_is_http_only():
    client = TestClient(app)
    response = client.post("/api/v1/auth/register",
                           json={"email": new_email(), "password": PASSWORD, "accept_history": True})
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    client.delete("/api/v1/auth/me")


def test_register_rules():
    client = TestClient(app)
    short = client.post("/api/v1/auth/register", json={"email": new_email(), "password": "short", "accept_history": True})
    no_consent = client.post("/api/v1/auth/register", json={"email": new_email(), "password": PASSWORD})
    bad_email = client.post("/api/v1/auth/register", json={"email": "not-an-email", "password": PASSWORD,
                                                           "accept_history": True})
    assert short.status_code == no_consent.status_code == bad_email.status_code == 422


def test_duplicate_email_is_refused_case_insensitively():
    client, email = account()
    other = TestClient(app)
    response = other.post("/api/v1/auth/register",
                          json={"email": email.upper(), "password": PASSWORD, "accept_history": True})
    assert response.status_code == 409
    client.delete("/api/v1/auth/me")


def test_wrong_password_and_unknown_email_get_the_same_answer():
    client, email = account()
    wrong_password = login(TestClient(app), email, "wrong password!!")
    unknown_email = login(TestClient(app), new_email())
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    client.delete("/api/v1/auth/me")


def test_logout_ends_the_session():
    client, email = account()
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    assert login(client, email).status_code == 200
    client.delete("/api/v1/auth/me")


def test_what_is_public_and_what_needs_a_session():
    client = TestClient(app)
    # The landing page's quick check: search, check, structures and stats work without an account.
    assert client.get("/api/v1/drugs/search", params={"q": "warfarin"}).status_code == 200
    assert client.post("/api/v1/interactions/known", json={"drug_ids": [WARFARIN, ASPIRIN]}).status_code == 200
    assert client.get(f"/api/v1/drugs/{WARFARIN}/structure").status_code == 200
    assert client.get("/api/v1/stats").status_code == 200
    # Everything else needs a session.
    assert client.get("/api/v1/checks").status_code == 401
    assert client.get("/api/v1/drugs").status_code == 401
    assert client.get(f"/api/v1/drugs/{WARFARIN}").status_code == 401


def test_a_check_without_an_account_is_not_saved():
    with SessionLocal() as db:
        before = db.scalar(select(func.count()).select_from(SavedCheck))
    TestClient(app).post("/api/v1/interactions/known", json={"drug_ids": [WARFARIN, ASPIRIN]})
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(SavedCheck)) == before


def test_checks_are_saved_listed_and_deleted():
    client, _ = account()
    client.post("/api/v1/interactions/known", json={"drug_ids": [WARFARIN, ASPIRIN]})
    client.post("/api/v1/interactions/known", json={"drug_ids": [WARFARIN, ASPIRIN, SILDENAFIL]})
    history = client.get("/api/v1/checks").json()
    assert [len(h["drugs"]) for h in history] == [3, 2]  # newest first
    first = history[1]["drugs"][0]
    assert (first["id"], first["name"]) == (WARFARIN, "Warfarin") and first["summary"].startswith("An anticoagulant")
    assert client.delete(f"/api/v1/checks/{history[0]['id']}").status_code == 204
    assert len(client.get("/api/v1/checks").json()) == 1
    client.delete("/api/v1/auth/me")


def test_nobody_can_delete_another_users_check():
    owner, _ = account()
    owner.post("/api/v1/interactions/known", json={"drug_ids": [WARFARIN, ASPIRIN]})
    check_id = owner.get("/api/v1/checks").json()[0]["id"]
    stranger, _ = account()
    assert stranger.delete(f"/api/v1/checks/{check_id}").status_code == 404
    assert len(owner.get("/api/v1/checks").json()) == 1
    owner.delete("/api/v1/auth/me")
    stranger.delete("/api/v1/auth/me")


def test_deleting_the_account_removes_it_and_its_history():
    client, email = account()
    client.post("/api/v1/interactions/known", json={"drug_ids": [WARFARIN, ASPIRIN]})
    assert client.delete("/api/v1/auth/me").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    assert login(TestClient(app), email).status_code == 401


def test_login_is_rate_limited():
    client = TestClient(app)
    codes = [login(client, new_email()).status_code for _ in range(6)]
    assert codes == [401] * 5 + [429]
    blocked = login(client, new_email())
    assert int(blocked.headers["retry-after"]) > 0
    assert blocked.json()["error"] == "rate_limited"


def test_security_headers():
    headers = TestClient(app).get("/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in headers["content-security-policy"]


def test_post_from_another_site_is_refused():
    response = TestClient(app).post("/api/v1/auth/login", headers={"Origin": "https://evil.example"},
                                    json={"email": new_email(), "password": PASSWORD})
    assert response.status_code == 403
    assert response.json()["error"] == "bad_origin"
