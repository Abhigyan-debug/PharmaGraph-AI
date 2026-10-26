# Progress

Status of the 60% milestone (commits 1–22 of the 36-commit plan). Updated 2026-10-26.
Rows 1–17 are pushed. Rows 5, 12 and 18–22 are written and checked (see `docs/testing.md`)
but not yet committed; they count as done once pushed.

| # | Owner | Deliverable | Status | Where / notes |
|---|---|---|---|---|
| 1 | Abhigyan | Scope and data source policy | Done | `docs/scope.md`, `data/README.md`: TDC, DDInter, Ayvaz, KEGG, PubChem |
| 2 | Abhigyan | Data dictionary | Done | `docs/data-dictionary.md` |
| 3 | Oshiva | FastAPI skeleton | Done | `backend/app/main.py` |
| 4 | Oshiva | Config (`core/config.py`) | Done | `DATABASE_URL` is PostgreSQL, read only from `.env` |
| 5 | Bhavishya | React + Vite app shell with routes | Done | Hash routes `#/`, `#/results`, `#/about/limitations`; Vite proxies `/api` to the backend |
| 6 | Bhavishya | README with setup guide | Done | `docs/README.md`: folders, setup, database, pipeline order, run, tests |
| 7 | Abhigyan | Dataset loaders | Done | `ml/pipelines/`: TDC, full DDInter, Ayvaz, KEGG |
| 8 | Abhigyan | Identifier normalization | Done | `map_ddinter_ids.py` (2,108 of 2,283 DDInter drugs), `build_tables.py` (`drugs` table, 1,706 drugs) |
| 9 | Abhigyan | Data quality report | Done | `ml/pipelines/quality_report.py` writes `docs/data-quality-report.md` |
| 10 | Abhigyan | Known DDI table with severity | Done | `build_tables.py` → `known_interactions` (191,808 rows) |
| 11 | Oshiva | PostgreSQL models and seed script | Done | `app/models/tables.py`, `app/core/database.py`, `app/seed.py`; loads 1,706 drugs and 191,808 interactions |
| 12 | Bhavishya | Drug search UI | Done | `src/api.js`; debounced search on the API, chips, Check interactions, real results |
| 13 | Abhigyan | Severity mapping service and tests | Done | Levels mapped in the pipeline; `app/services/severity.py` decides `contraindicated`; `tests/test_severity.py` |
| 14 | Oshiva | Search API | Done | `GET /api/v1/drugs/search`: names and brand names, typo-tolerant |
| 15 | Oshiva | Input validation | Done | 2–10 distinct drugs, known IDs; 422 otherwise |
| 16 | Oshiva | Known DDI API | Done | `POST /api/v1/interactions/known`; also lists pairs with no record |
| 17 | Oshiva | Errors and logging | Done | One error shape `{error, detail, code}`; one log line and an `X-Request-ID` per request |
| 18 | Bhavishya | API tests | Done | `backend/tests/test_api.py`, 13 tests on the seeded database; 17 pass with the severity tests |
| 19 | Abhigyan | RDKit fingerprints | Done | `ml/pipelines/featurize.py` → `node_features.npz`, 1,705 × 2,048 (DB11630 left out) |
| 20 | Abhigyan | PyG graph | Done | `ml/graph/build_graph.py` → `pharmgraph.pt`, 1,705 nodes, 191,392 undirected edges |
| 21 | Abhigyan | Edge split | Done | `ml/graph/split_edges.py` → `edge_split.npz`, 70/15/15, 1:1 negatives, seed 42, no pair in two parts |
| 22 | Abhigyan | Logistic regression baseline | Done | `ml/models/baseline_sklearn.py` → `ml/experiments/baseline_metrics.json`; test AUPR 0.858 (random 0.501) |

## Blocked or waiting

- Full DDInter export requested from the DDInter authors by email; not needed any more for
  coverage (decision 13), but would confirm the 2.4% gap between our copy and their stated count.
- Mentor's answer on whether ~45% severity coverage is acceptable, and on the Kaggle
  Deep-Pharma data (not used).
