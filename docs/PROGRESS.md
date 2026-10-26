# Progress

Status of the 60% milestone (commits 1–22 of the 36-commit plan). Updated 2026-10-26.
A commit only counts as done once it's pushed; "In progress" means code exists but the
deliverable isn't finished.

| # | Owner | Deliverable | Status | Where / notes |
|---|---|---|---|---|
| 1 | Abhigyan | Scope and data source policy | Done | `docs/scope.md`, `data/README.md`. Data sources section still names DrugBank; needs TDC + DDInter + Ayvaz + KEGG |
| 2 | Abhigyan | Data dictionary | Done | `docs/data-dictionary.md` |
| 3 | Oshiva | FastAPI skeleton | Done | `backend/app/main.py` |
| 4 | Oshiva | Config (`.env.example`, `core/config.py`) | Done | Pushed 2026-10-25. `DATABASE_URL` still defaults to SQLite; decision 11 chose PostgreSQL, to align with commit 11 |
| 5 | Bhavishya | React + Vite app shell with routes | In progress | `frontend/`, one page on sample data, no routes yet |
| 6 | Bhavishya | README with setup guide | Not started | |
| 7 | Abhigyan | Dataset loaders | Done once pushed | `ml/pipelines/`: TDC, full DDInter, Ayvaz, KEGG |
| 8 | Abhigyan | Identifier normalization | Done once pushed | `map_ddinter_ids.py` (2,108 of 2,283 DDInter drugs), `build_tables.py` (`drugs` table, 1,706 drugs) |
| 9 | Abhigyan | Data quality report | Done once pushed | `ml/pipelines/quality_report.py` writes `docs/data-quality-report.md` |
| 10 | Abhigyan | Known DDI table with severity | Done once pushed | `build_tables.py` → `known_interactions` (191,808 rows) |
| 11 | Oshiva | PostgreSQL models and seed script | Not started | Blocked on nothing: tables in `data/processed/` are ready |
| 12 | Bhavishya | Drug search UI | In progress | Searches sample data, not the API |
| 13 | Abhigyan | Severity mapping service and tests | In progress | Rules done and verified in the pipeline; backend copy and unit tests not written |
| 14 | Oshiva | Search API | Not started | |
| 15 | Oshiva | Input validation | Not started | |
| 16 | Oshiva | Known DDI API | Not started | |
| 17 | Oshiva | Errors and logging | Not started | |
| 18 | Bhavishya | API tests | Not started | Needs 14–17 |
| 19 | Abhigyan | RDKit fingerprints | Not started | 1,705 of 1,706 SMILES parse (DB11630 does not) |
| 20 | Abhigyan | PyG graph | Not started | |
| 21 | Abhigyan | Edge split | Not started | |
| 22 | Abhigyan | Logistic regression baseline | Not started | |

## Blocked or waiting

- Full DDInter export requested from the DDInter authors by email; not needed any more for
  coverage (decision 13), but would confirm the 2.4% gap between our copy and their stated count.
- Mentor's answer on whether ~45% severity coverage is acceptable, and on the Kaggle
  Deep-Pharma data (not used).
