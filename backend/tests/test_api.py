import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.database import engine
from app.main import app

WARFARIN, ASPIRIN = "pg_000472", "pg_000702"
SILDENAFIL, NITROGLYCERIN = "pg_000051", "pg_000512"
BIVALIRUDIN, GOSERELIN = "pg_000001", "pg_000002"


def database_ready():
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT count(*) FROM known_interactions")).scalar() > 0
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not database_ready(), reason="needs the seeded PostgreSQL database")

client = TestClient(app)


def check(ids):
    return client.post("/api/v1/interactions/known", json={"drug_ids": ids})


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_search_by_name_brand_and_typo():
    for q in ("warfarin", "Coumadin", "warfrin"):
        hits = client.get("/api/v1/drugs/search", params={"q": q}).json()
        assert hits[0] == {"id": WARFARIN, "name": "Warfarin"}


def test_search_query_too_short():
    response = client.get("/api/v1/drugs/search", params={"q": "w"})
    assert response.status_code == 422
    assert response.json()["code"] == 422


def test_known_pair_with_severity():
    body = check([WARFARIN, ASPIRIN]).json()
    assert body["pairs_checked"] == 1
    assert body["pairs_without_record"] == []
    hit = body["interactions"][0]
    assert hit["result_type"] == "known"
    assert hit["pair"] == [WARFARIN, ASPIRIN]
    assert hit["severity"] == "major"
    assert hit["contraindicated"] is False


def test_contraindicated_pair():
    hit = check([NITROGLYCERIN, SILDENAFIL]).json()["interactions"][0]
    assert hit["contraindicated"] is True
    assert "CI" in hit["severity_raw"]


def test_pair_without_record_is_listed_not_hidden():
    body = check([BIVALIRUDIN, GOSERELIN]).json()
    assert body["interactions"] == []
    assert body["pairs_without_record"] == [[BIVALIRUDIN, GOSERELIN]]


def test_three_drugs_check_three_pairs():
    body = check([WARFARIN, ASPIRIN, SILDENAFIL]).json()
    assert body["pairs_checked"] == 3
    checked = {tuple(i["pair"]) for i in body["interactions"]} | set(map(tuple, body["pairs_without_record"]))
    assert len(checked) == 3


def test_unknown_drug_id():
    response = check([WARFARIN, "pg_999999"])
    assert response.status_code == 422
    assert response.json()["error"] == "unknown_drug_ids"
    assert response.json()["detail"] == ["pg_999999"]


@pytest.mark.parametrize("ids", [[], [WARFARIN], [WARFARIN, WARFARIN], [f"pg_{i:06d}" for i in range(1, 12)]])
def test_selection_must_be_two_to_ten_distinct(ids):
    response = check(ids)
    assert response.status_code == 422
    assert set(response.json()) == {"error", "detail", "code"}


def test_every_response_has_a_request_id():
    assert len(client.get("/health").headers["X-Request-ID"]) == 12
