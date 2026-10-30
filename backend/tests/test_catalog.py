import pytest
from fastapi.testclient import TestClient

from app.main import app
from conftest import requires_db, sign_up

pytestmark = requires_db

WARFARIN, ASPIRIN, BIVALIRUDIN = "pg_000472", "pg_000702", "pg_000001"

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def signed_in():
    sign_up(client)
    yield
    client.delete("/api/v1/auth/me")


def test_drug_list_pages_and_filters():
    first = client.get("/api/v1/drugs").json()
    assert first["total"] == 1706 and first["page_size"] == 24 and len(first["drugs"]) == 24
    second = client.get("/api/v1/drugs", params={"page": 2}).json()
    assert not {d["id"] for d in first["drugs"]} & {d["id"] for d in second["drugs"]}
    found = client.get("/api/v1/drugs", params={"q": "warfarin"}).json()
    row = found["drugs"][0]
    assert row["id"] == WARFARIN and row["has_3d"] and row["interactions"] > 0
    assert row["thumbnail"].lstrip().startswith("<?xml")


def test_drug_list_rejects_bad_pages():
    assert client.get("/api/v1/drugs", params={"page": 0}).status_code == 422


def test_drug_detail_maps_identifiers():
    drug = client.get(f"/api/v1/drugs/{WARFARIN}").json()
    assert drug["inchikey"] == "PJVWKTKQMONHTI-UHFFFAOYSA-N"  # the same key DrugBank's warfarin page shows
    assert drug["identifiers"] == {"drugbank": ["DB00682"], "pubchem": ["54678486"],
                                   "ddinter": ["DDInter1951"], "kegg": ["D08682"]}


def test_drug_detail_partners_are_worst_first_and_counted():
    drug = client.get(f"/api/v1/drugs/{WARFARIN}").json()
    assert sum(drug["by_severity"].values()) == drug["interaction_total"]
    order = ["major", "moderate", "minor", "unknown"]
    ranks = [order.index(p["severity"]) for p in drug["partners"]]
    assert ranks == sorted(ranks)
    assert ASPIRIN in {p["id"] for p in drug["partners"]}  # warfarin + aspirin is major


def test_unknown_drug_is_404():
    response = client.get("/api/v1/drugs/pg_999999")
    assert response.status_code == 404 and response.json()["error"] == "drug_not_found"


def test_stats_match_the_data():
    stats = client.get("/api/v1/stats").json()
    assert stats["drugs"] == 1706 and stats["with_3d"] == 1609
    assert stats["pairs"] == sum(stats["severity"].values())
    assert stats["kegg"] == 1423 and stats["ddinter"] == 1241


def test_search_and_drug_page_explain_the_drug():
    hit = client.get("/api/v1/drugs/search", params={"q": "warfarin"}).json()[0]
    assert hit["summary"].startswith("An anticoagulant")
    drug = client.get(f"/api/v1/drugs/{WARFARIN}").json()
    assert drug["mesh_id"] == "D014859" and "vitamin K" in drug["description"]
