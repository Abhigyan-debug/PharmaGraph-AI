# Architecture

This is the map of the repo: what lives where and which rules the code has to keep. It doesn't
explain how each part works; that's what the code comments and `docs/` are for. Some parts
below aren't built yet and are marked *(planned)* so the map shows where they will go.

## Bird's eye view

A user picks two to ten medicines. The app answers with two separate lists: interactions that
are documented in a source database, and interactions a graph neural network predicts but
nobody has confirmed.

Everything heavy happens offline. The pipeline turns downloaded datasets into clean tables and
a trained model file. At runtime the backend only reads: documented interactions from
PostgreSQL, predicted ones from the model loaded at startup. The frontend calls the two
endpoints and renders the answers in separate sections.

```
data/raw/  ──ml/pipelines──>  data/processed/  ──seed──>  PostgreSQL ──┐
                                   │                                    ├──> backend/ ──> frontend/
                                   └──ml/graph, ml/models──>  gcn_ddi.pt┘
```

## Code map

### `data/`

Only `README.md` and `checksums.txt` are committed. `raw/` holds downloads (TDC, DDInter, the
Ayvaz merged set, KEGG and PubChem caches), `processed/` holds pipeline output. Both are
gitignored. `checksums.txt` is how we check we're all working off the same files.

### `ml/pipelines/`

One script per step, each runnable as `python -m ml.pipelines.<name>`. They read from
`data/raw/` and write Parquet, CSV or JSON. Severity runs in this order:

1. `map_ddinter_ids` builds the DDInter to DrugBank map, from K-Paths and exact names.
2. `load_ayvaz` parses the Ayvaz et al. merged dataset and maps its labels to our severity
   enum. `SEVERITY_MAP` is the table to look at.
3. `load_kegg` pulls severity from the live KEGG DDI API and matches KEGG entries to our drugs
   by structure (`structure_key`). Slow; it caches everything and resumes.
4. `merge_severity` combines the three into one row per pair, most severe level wins, and
   prints the coverage of TDC pairs.

`fetch_pubchem_names` gets the CID, name and synonyms for every TDC drug, for search.
`pubchem` is the shared PubChem client; it reads PubChem's throttling header and slows down
before PubChem starts refusing.

`build_tables` runs last. It writes the two tables the backend loads,
`data/processed/drugs.parquet` and `data/processed/known_interactions.parquet`, and refuses to
write them if any rule from the data dictionary breaks (`check()`).

`quality_report` reads the final tables and writes `docs/data-quality-report.md`. Every number
in that file comes from the script; rerun it rather than editing the report.

*(planned)* `featurize`.

### `ml/graph/`, `ml/models/` *(planned)*

`build_graph` and `split_edges` produce the PyG graph and the train/val/test split.
`baseline_sklearn` is the logistic regression baseline and `gcn_ddi` the GCN with its MLP
decoder. Trained weights go to `ml/artifacts/` (gitignored).

### `backend/app/`

FastAPI. `main.py` creates the app and sets CORS for the Vite dev server.

- `api/routes/`: one module per resource (`drugs`, `interactions`), mounted under `/api/v1` in
  `main.py`. Thin; they validate input and call a service. `/interactions/predict` is still a
  placeholder.
- `services/`: the logic. `drugs.py` (search), `interactions.py` (known interactions),
  `severity.py` (whether a pair may be called contraindicated).
- `core/errors.py`: every error as `{error, detail, code}`. `core/request_log.py`: one log line
  and an `X-Request-ID` per request.
- `tests/`: unit tests, run from `backend/` with pytest.
- `models/schemas.py`: Pydantic request and response shapes, including the 2–10 drug rule.
- `models/tables.py`: the SQLAlchemy tables `drugs` and `known_interactions`, with the data
  dictionary's rules as database constraints. Synonyms are an array column on `drugs`. Pydantic
  response schemas come with the API commits.
- `core/config.py`: settings from `.env` (`DATABASE_URL`, `MODEL_PATH`, ...). `core/database.py`:
  the engine and session factory.
- `seed.py`: drops, recreates and reloads both tables from `data/processed/`
  (`cd backend; ..\.venv\Scripts\python.exe -m app.seed`).

Dependencies are pinned in `backend/requirements.txt`. The database is PostgreSQL 17 with the
`pg_trgm` extension, one app user and one database, both named `pharmgraph`.

### `frontend/`

React + Vite (JavaScript). `App.jsx` holds the state and puts the page together from
`components/` (`Header`, `Hero`, `SearchPanel`, `ResultsPanel`, `SafetyPanel`). The data comes
from `data/sampleData.js` until the UI calls the API. Routes `/`, `/results` and
`/about/limitations` still to come. The API client will be the only place where JSON field
names are converted to camelCase.

### `docs/`

This file, the scope, the data dictionary, the decision log and the code of conduct. Later the
quality report, model card and limitations page go here too. `docs/data-dictionary.md` is the
source of truth for field names across every layer.

## Invariants

These are the rules that hold across the codebase. Most of them are about what must *not*
happen, so they're easy to break by accident.

- **Documented and predicted interactions never share a list.** Every result carries
  `result_type` (`known` or `potential_gnn`) and the frontend renders the two in separate
  sections. No endpoint returns them merged.
- **Predictions never carry a severity.** Severity only comes from a source record. When no
  source has one, it's `unknown`.
- **"Contraindicated" is shown only when `severity_raw` says so.**
- **One pair, one key.** `pair_key = "__".join(sorted([a, b]))`. (A, B) and (B, A) are the same
  interaction everywhere.
- **The graph uses row indices, the database uses `drug_id`s.** The bridge is the `drug_ids`
  array in `node_features.npz`. Keep it next to the feature matrix it describes.
- **Val and test edges are never in the training graph.**
- **The backend doesn't need the model to start.** If the model file is missing, the known-DDI
  endpoint still works and the predict endpoint says why it can't.
- **The backend never writes to the interaction tables.** They're rebuilt from the pipeline.

## Cross-cutting concerns

**Identifiers.** Internally `drug_id` (`pg_` + 6 digits). DrugBank IDs come from TDC; DDInter,
KEGG and PubChem are mapped onto them in the pipeline, never at request time.

**Data versions and licences.** Every raw file has a line in `data/checksums.txt`. DDInter is
CC BY-NC-SA, KEGG and the Ayvaz set can't be redistributed, so no endpoint offers a bulk export.

**Network calls.** Only the pipeline talks to external APIs (PubChem, KEGG), and it caches
every answer. The running app makes no external calls.

**Decisions.** Anything that changes one of the invariants above, or picks between real
alternatives, gets an entry in `docs/decisions.md`.
