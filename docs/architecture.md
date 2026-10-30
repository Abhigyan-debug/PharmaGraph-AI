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

`featurize` turns each drug's SMILES into a Morgan fingerprint and writes
`node_features.npz`: the matrix `X` and the `drug_ids` array that says which drug each row is.

`conformers` builds one 3D model (MolBlock) per drug with RDKit and writes
`data/processed/conformers.parquet` (`drug_id`, `molblock`, `conformer_note`). It runs on all
CPU cores and has to run before `seed` (decision 14).

`identifiers` maps each drug to its DDInter and KEGG ids and computes InChI / InChIKey, writing
`data/processed/identifiers.parquet`; also needed before `seed` (decision 22).

### `ml/graph/`, `ml/models/`

`split_edges` divides the known pairs 70/15/15 into train, val and test, adds the same number
of random non-pairs to each part, and refuses to write if any pair is in two parts.
`build_graph` writes `pharmgraph.pt`, the PyG graph of every known pair; `positive_pairs` in
`split_edges` is shared by both, so they see the same edges. Training must use only the train
edges for message passing.

`baseline_sklearn` is the logistic regression baseline; it writes its scores to
`ml/experiments/baseline_metrics.json` (committed). *(planned)* `gcn_ddi`, the GCN with its MLP
decoder. Trained weights go to `ml/artifacts/` (gitignored).

### `backend/app/`

FastAPI. `main.py` creates the app and sets CORS for the Vite dev server.

- `api/routes/`: one module per resource (`auth`, `checks`, `drugs`, `interactions`, `stats`),
  mounted under `/api/v1` in `main.py`. Thin; they validate input and call a service.
  `/interactions/predict` is still a placeholder. Public: search, `/interactions/known` (saved only
  when signed in, via `optional_user`), `/drugs/{id}/structure`, `/stats`, register and login.
  Everything else (`/drugs`, `/drugs/{id}`, `/checks`, `/auth/me`) depends on `current_user`.
- `services/`: the logic. `drugs.py` (search), `interactions.py` (known interactions),
  `severity.py` (whether a pair may be called contraindicated), `structure.py` (formula,
  weight and a 2D SVG drawn by RDKit, plus the stored 3D model, for
  `GET /drugs/{drug_id}/structure`), `auth.py` (password hashing, sessions, `current_user`),
  `history.py` (save, list and delete a user's checks), `catalog.py` (paged drug list with
  thumbnails, drug detail with identifiers and every partner, cached `/stats`).
- `core/errors.py`: every error as `{error, detail, code}`. `core/request_log.py`: one log line
  and an `X-Request-ID` per request. `core/security.py`: security headers, the origin check on
  POST/DELETE, the body-size cap. `core/rate_limit.py`: per-IP request limits, used as route
  dependencies.
- `tests/`: run from `backend/` with pytest. `test_api.py` calls the endpoints through
  `TestClient` and needs the seeded database; it skips itself otherwise.
- `models/schemas.py`: Pydantic request and response shapes, including the 2–10 drug rule.
- `models/tables.py`: the SQLAlchemy tables `drugs` and `known_interactions`, with the data
  dictionary's rules as database constraints. Synonyms are an array column on `drugs`. Pydantic
  response schemas come with the API commits.
- `core/config.py`: settings from `.env` (`DATABASE_URL`, `MODEL_PATH`, ...). `core/database.py`:
  the engine and session factory.
- `seed.py`: drops, recreates and reloads both tables from `data/processed/`, joining
  `conformers.parquet` onto `drugs` (`cd backend; ..\.venv\Scripts\python.exe -m app.seed`).

Dependencies are pinned in `backend/requirements.txt`. The database is PostgreSQL 17 with the
`pg_trgm` extension, one app user and one database, both named `pharmgraph`.

### `frontend/`

React + Vite (JavaScript). `App.jsx` holds the state, picks the page from the URL hash
(`#/` landing, `#/check`, `#/results`, `#/history`, `#/signin`, `#/register`,
`#/about/limitations`) and puts it together from `components/` (`Header`, `Landing`,
`SearchPanel`, `AboutCheck`, `ResultsPanel`, `SafetyPanel`, `AuthForm`, `History`, `DrugList`,
`DrugPage`, `Research`, `KnowledgeGraph`, `CommandPalette`, `Footer`). Routes also take an id:
`#/drugs/{drug_id}` and `#/research/{section}`. The private routes (`#/check`, `#/results`,
`#/history`, `#/drugs`, `#/research`) show the sign-in form when there is no session; the landing
page's quick check works without one. `Brand` holds the intro and the logo that flies into the
header; `Header` has the mega-menu, theme toggle and account menu; `CommandPalette` is the
Ctrl/⌘ K drug search; `KnowledgeGraph` is the nested module/table graph on the research page.
Animation is Motion (`motion/react`), configured once in `main.jsx` to respect reduced motion.
Styles are split into `styles.css` (tokens, themes, shared parts), `landing.css`, `catalog.css`
and `research.css`. The results
page adds `InteractionMap` (SVG diagram of the pairs) and `MoleculePanel` (2D/3D structure of
one drug at a time); `Molecule3D` wraps 3Dmol.js, loaded on demand, and is shared with the landing page.
Colours are tokens at the top of `styles.css`; print resets them to dark-on-white. `api.js` is the only file
that calls the backend and the only place where JSON field names become camelCase. In
development Vite forwards `/api` to the backend on port 8000 (`vite.config.js`).

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
- **Sign-in is checked by the API, not the page.** Every private endpoint depends on
  `current_user`; hiding a link is not access control.
- **A user only ever reads or deletes their own rows.** History queries filter on the signed-in
  user's ID.
- **`seed.py` never drops the account tables.**
- **No 3D embedding at request time.** It can take a minute for some molecules; 3D models come
  from the `conformers` pipeline through the database.

## Cross-cutting concerns

**Identifiers.** Internally `drug_id` (`pg_` + 6 digits). DrugBank IDs come from TDC; DDInter,
KEGG and PubChem are mapped onto them in the pipeline, never at request time.

**Data versions and licences.** Every raw file has a line in `data/checksums.txt`. DDInter is
CC BY-NC-SA, KEGG and the Ayvaz set can't be redistributed, so no endpoint offers a bulk export.

**Network calls.** Only the pipeline talks to external APIs (PubChem, KEGG), and it caches
every answer. The running app makes no external calls (the page loads fonts from Google Fonts).

**Security.** Sessions, password hashing, rate limits, headers and the CSP are decisions 18–20.
Settings: `HTTPS` (Secure cookie and HSTS, set it once served over HTTPS) and `SESSION_DAYS`.

**Decisions.** Anything that changes one of the invariants above, or picks between real
alternatives, gets an entry in `docs/decisions.md`.
