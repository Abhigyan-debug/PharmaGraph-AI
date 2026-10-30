import pytest
from fastapi.testclient import TestClient

from app.main import app
from conftest import requires_db, sign_up

WARFARIN, ASPIRIN = "pg_000472", "pg_000702"
SILDENAFIL, NITROGLYCERIN = "pg_000051", "pg_000512"
BIVALIRUDIN, GOSERELIN = "pg_000001", "pg_000002"
QUININE = "pg_000287"

pytestmark = requires_db

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def signed_in():
    sign_up(client)
    yield
    client.delete("/api/v1/auth/me")


def check(ids):
    return client.post("/api/v1/interactions/known", json={"drug_ids": ids})


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_search_by_name_brand_and_typo():
    for q in ("warfarin", "Coumadin", "warfrin"):
        hits = client.get("/api/v1/drugs/search", params={"q": q}).json()
        assert (hits[0]["id"], hits[0]["name"]) == (WARFARIN, "Warfarin")


def test_search_puts_name_matches_before_brand_matches():
    hits = client.get("/api/v1/drugs/search", params={"q": "war"}).json()
    assert (hits[0]["id"], hits[0]["name"]) == (WARFARIN, "Warfarin")


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


def test_structure_has_2d_and_3d():
    body = client.get(f"/api/v1/drugs/{WARFARIN}/structure").json()
    assert body["formula"] == "C19H16O4"
    assert body["svg"].lstrip().startswith("<?xml")
    assert "V2000" in body["molblock"]
    assert body["note_3d"] is None


def test_large_molecule_gets_2d_only():
    body = client.get(f"/api/v1/drugs/{BIVALIRUDIN}/structure").json()
    assert body["molblock"] is None
    assert "2D only" in body["note_3d"]


def test_stereo_relaxed_model_says_so():
    body = client.get(f"/api/v1/drugs/{QUININE}/structure").json()
    assert "V2000" in body["molblock"]
    assert "Stereochemistry" in body["note_3d"]


def test_structure_unknown_drug():
    response = client.get("/api/v1/drugs/pg_999999/structure")
    assert response.status_code == 404
    assert response.json()["error"] == "structure_not_found"


def test_search_says_which_synonym_matched():
    by_name = {h["name"]: h for h in client.get("/api/v1/drugs/search", params={"q": "aspirin"}).json()}
    assert by_name["Cefotiam"]["matched"] == "Aspil"  # found through a brand name, not its own name
    assert client.get("/api/v1/drugs/search", params={"q": "coumadin"}).json()[0]["matched"] == "Coumadin"
    assert client.get("/api/v1/drugs/search", params={"q": "warfarin"}).json()[0]["matched"] is None
