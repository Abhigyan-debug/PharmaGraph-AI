# Testing

Checks that have actually been run, with the command, the date and the real result. Anything
not listed here hasn't been tested.

Commands run from the repo root with the project venv (`.venv\Scripts\python.exe`).

## Data pipeline

| Date | What was checked | How | Result |
|---|---|---|---|
| 2026-10-11 | Full DDInter copy matches DDInter's official CSVs | compared all pairs present in both | 160,235 of 160,235 pairs have the same level |
| 2026-10-26 | DDInter → DrugBank fallbacks are accurate | `python -m ml.pipelines.map_ddinter_ids` compares them with DDInter's own links | K-Paths 1,513 / 1,514; name match 1,139 / 1,151 (99.0%) |
| 2026-10-26 | No wrong synonyms from Ayvaz | searched synonyms for names on the wrong drug | Ayvaz's CredibleMeds rows put ATORVASTATIN_CALCIUM on DB01077/78/80; those rows are now skipped and no drug carries it |
| 2026-10-11 | KEGG structure matching | structure key from PubChem vs from KEGG's own MOL file, 22 random entries | 22 / 22 agree |
| 2026-10-11 | Severity merge follows most-severe-wins | recomputed every graded pair's level from its `severity_raw` labels | 0 mismatches in 85,756 pairs |
| 2026-10-11 | Severity coverage of TDC pairs | `python -m ml.pipelines.merge_severity` | 85,756 of 191,402 pairs (44.80%) |
| 2026-10-16 | Pair keys are canonical | checked `severity_by_pair.parquet` | pair_key unique, drug_a < drug_b on all 317,615 rows, 0 self pairs |
| 2026-10-26 | SMILES parse in RDKit | `build_tables.py` (`supported_for_ml`) | 1,705 / 1,706; DB11630 has a malformed SMILES |
| 2026-10-26 | Drug and interaction tables | `python -m ml.pipelines.build_tables` | all `check()` rules pass; 1,706 drugs, 191,808 interactions over 191,402 pairs; severity per pair matches the merge (85,756 graded + 105,646 unknown) |
| 2026-10-26 | Every drug has a readable name | inspected `drugs.parquet` | all 1,706 named (DDInter 1,228, PubChem 474, Ayvaz 4); 7 are long chemical names because no source has a common name |
| 2026-10-26 | Brand names reach search | inspected synonyms | warfarin: Coumadin, Jantoven; atorvastatin: Lipitor; 1,692 drugs have at least one synonym |
| 2026-10-26 | Sample row is right | warfarin + aspirin in `known_interactions` | "Warfarin may increase the anticoagulant activities of Acetylsalicylic acid.", major, `DDInter: Major; FrenchDB: PC; KEGG: P; OSCAR: 2` |

| 2026-10-26 | Quality report numbers | `python -m ml.pipelines.quality_report` | all 14 input files match `data/checksums.txt`; coverage 34.65% (DDInter) → 40.30% (+ Ayvaz) → 44.80% (+ KEGG); 0 orphan interactions; 32,742 pairs graded by two or more sources |

## Database (PostgreSQL 17, local)

| Date | What was checked | How | Result |
|---|---|---|---|
| 2026-10-26 | Seed loads everything | `cd backend; ..\.venv\Scripts\python.exe -m app.seed` | 1,706 drugs and 191,808 interactions, equal to the Parquet files; a second run reloads cleanly |
| 2026-10-26 | Database refuses bad rows | inserted three invalid rows by hand | severity `severe` → CheckViolation; unsorted pair → CheckViolation; unknown drug → ForeignKeyViolation |
| 2026-10-26 | Query returns the right row | warfarin + aspirin by `pair_key` | "Warfarin may increase the anticoagulant activities of Acetylsalicylic acid.", major |
| 2026-10-26 | Typo-tolerant matching | `similarity(name_normalized, 'warfrin')` | Warfarin 0.55; next best 0.19 |
| 2026-10-26 | Pair lookup speed | `EXPLAIN ANALYZE` after the seed's `ANALYZE` | index scan on `(pair_key, interaction_type)`, 0.051 ms |

## API (run against the local server)

Server: `cd backend; ..\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`

| Date | Request | Result |
|---|---|---|
| 2026-10-26 | `GET /health` | `{"status":"ok"}` |
| 2026-10-26 | search `warf`, `warfrin`, `coumadin` | Warfarin only |
| 2026-10-26 | search `lipitor`, `atorvastatn` | Atorvastatin only |
| 2026-10-26 | search `a` (one letter) | 422 |
| 2026-10-26 | known, warfarin + aspirin + simvastatin | 3 pairs checked; warfarin–aspirin major, warfarin–simvastatin moderate; simvastatin–aspirin listed under `pairs_without_record` |
| 2026-10-26 | known, 1 drug / same drug twice / 11 drugs | 422 "select between 2 and 10 different drugs" |
| 2026-10-26 | known, unknown id `pg_999999` | 422 naming `pg_999999` |
| 2026-10-26 | known, body without `drug_ids` | 422 "Field required" |

| 2026-10-26 | known, sildenafil + nitroglycerin + warfarin + aspirin | sildenafil–nitroglycerin major, `contraindicated: true` (FrenchDB CI, KEGG CI); warfarin–aspirin major, `contraindicated: false` |
| 2026-10-26 | error shapes: short search, 1 drug, unknown id, unknown route, wrong method | all `{"error", "detail", "code"}`: `validation_error` 422, `unknown_drug_ids` 422, `not_found` 404, `method_not_allowed` 405 |
| 2026-10-26 | request logging | one `request_id=… method=… path=… status=… ms=…` line per request; `X-Request-ID` header matches the log |

Unit tests: `tests/test_severity.py`, 4 tests, all pass (run as plain functions on 2026-10-26;
pytest couldn't be installed that day because PyPI wasn't reachable). Not tested yet: the 500
handler, since nothing triggers an unexpected error on purpose.

The first search run used pg_trgm's default cut-off of 0.3 and returned look-alike brands
("lipitor" also gave Lamotrigine through "Lamitor", 0.33). Real typos scored 0.55–0.67, so the
cut-off is now 0.4. Error responses don't share one shape yet; that's commit 17.

`build_tables.py` runs its own checks every time (see `check()`): unique `drug_id`, one
`drug_id` per DrugBank ID, unique `(pair_key, interaction_type)`, sorted pair, both drugs exist,
no `#Drug` placeholder left, severity in the enum. The build stops if any fails.

## Not yet tested

- API: no automated test suite yet (commit 18); the checks above were run by hand. Prediction
  endpoint is still a placeholder.
- Model: no fingerprints, graph or baseline yet (commits 19–22).
- Frontend: runs on sample data only; never tested against the API.
