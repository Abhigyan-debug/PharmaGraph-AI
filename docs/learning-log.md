# Learning log

What was built, how it works, and the concepts behind it. Newest first.

## 2026-10-26 — Fingerprints, edge split, graph, baseline (commits 19–22)

**Fingerprints (`ml/pipelines/featurize.py`).** `rdFingerprintGenerator.GetMorganGenerator(radius=2,
fpSize=2048)` looks at every atom and its neighbourhood up to two bonds away, hashes each pattern
to one of 2,048 positions and sets that bit. `GetFingerprintAsNumPy` returns the bits as a NumPy
array, and `np.stack` puts the 1,705 arrays into one matrix. Rows are sorted by `drug_id` and
saved next to that `drug_ids` array, so row 0 is always the same drug. 28 drugs share a
fingerprint with another. 27 of them differ only in stereochemistry (citalopram and
escitalopram, quinine and quinidine), which Morgan bits ignore by default; the last is
trihexyphenidyl and procyclidine.

**Edge split (`ml/graph/split_edges.py`).** `positive_pairs` turns each known pair into two row
indices with the smaller first. `rng = np.random.default_rng(42)` shuffles them once, the first
70% become train, the next 15% val, the rest test. `sample_negatives` draws random index pairs
and keeps one only if it isn't a self pair, isn't a known pair and wasn't drawn before; the
`forbidden` set grows after each part, so a negative can't repeat across parts either. The last
loop compares all six parts pairwise and stops the script if any two share a pair: that's the
leakage check. Splitting by edge means every drug is seen in training; a split by drug would
test new drugs and is harder.

**Graph (`ml/graph/build_graph.py`).** PyG stores edges as `edge_index`, a 2 × E tensor of row
indices. `to_undirected` adds (v, u) for every (u, v), so 191,392 pairs become 382,784 columns.
`Data(x=..., edge_index=..., drug_ids=...)` bundles features, edges and the ID list;
`torch.save` writes it. The checks make sure the edge count is exactly twice the pair count, the
graph is undirected, and there are no self loops. Loading it back needs
`torch.load(path, weights_only=False)`, because the file holds a Python object and not just
tensors.

**Baseline (`ml/models/baseline_sklearn.py`).** A pair's features are the two fingerprints side
by side, 4,096 columns. They're mostly zeros, so `scipy.sparse` keeps only the ones and
`sparse.hstack` glues the two halves. `LogisticRegression(solver="liblinear")` learns one weight
per column; `predict_proba(...)[:, 1]` is the probability of "interacts". AUROC and AUPR rank the
scores without a cut-off, F1 uses 0.5. A random-score row on the same pairs shows what guessing
gets (about 0.50 everywhere at 1:1). Test AUPR is 0.858: the number the GCN has to beat.

## 2026-10-26 — Frontend on the real API, routes, API tests (commits 5, 12, 18)

**Proxy.** `server.proxy: {'/api': 'http://127.0.0.1:8000'}` in `vite.config.js` makes the dev
server forward any `/api/...` request to FastAPI, so the browser only talks to port 5173.

**API client (`src/api.js`).** `request` calls `fetch`, reads the JSON, and on a non-2xx status
throws an `Error` with the backend's `detail`, so components only deal with data or an error
message. `checkKnownInteractions` renames `pairs_checked` to `pairsChecked` and so on, here and
nowhere else.

**Debounced search (`App.jsx`).** The `useEffect` on `[query]` starts a 250 ms `setTimeout`. If
the user types again first, React runs the cleanup function: `clearTimeout` cancels the timer
and `controller.abort()` cancels a request already in flight, so an old answer can't overwrite a
newer one. An aborted `fetch` rejects with `AbortError`, which is ignored.

**Hash routes.** `window.location.hash` is the part after `#`. A `hashchange` listener copies it
into `route` state and the page renders one of three views. No router library, and refreshing
`#/results` needs no server setup. Results live in state, so a refresh empties that page, which
then links back to search.

**Results.** Each documented card shows the severity, a red Contraindicated badge only when the
API's `contraindicated` is true, and "Severity not reported by our sources" for `unknown`. Pairs
in `pairs_without_record` get their own box that says no record does not mean safe. The GNN
column says the model isn't trained yet instead of showing made-up numbers.

**API tests (`backend/tests/test_api.py`).** `TestClient(app)` sends requests straight into the
FastAPI app, through the middleware and error handlers, without a server. `pytestmark =
pytest.mark.skipif(...)` skips the whole file when the database isn't seeded, instead of failing
with a connection error. `@pytest.mark.parametrize` runs one test with four bad selections.

## 2026-10-26 — Error format, request logging, severity service (commits 17 and 13)

**One error shape (`core/errors.py`).** FastAPI's defaults answer a validation error, an
`HTTPException` and a crash in three different shapes. `app.add_exception_handler(Type, func)`
says "when this kind of exception escapes a route, build the response with `func`", so every
failure now looks like `{"error": "validation_error", "detail": [...], "code": 422}`. Handling
starlette's `HTTPException` (not just FastAPI's) also covers 404 and 405, which the framework
raises itself. A crash returns a generic 500 message; the real traceback goes to the log only,
because error text can leak internals.

**Request logging (`core/request_log.py`).** `app.middleware("http")(log_requests)` wraps every
request: `call_next(request)` runs the route, and the code around it measures time with
`time.perf_counter()`. Each request gets a random 12-character ID, sent back in the
`X-Request-ID` header and written in the log line, so a problem seen in the browser can be found
in the log. Only the path is logged, never the query string or body. (The file isn't named
`logging.py`: a module with a standard-library name can shadow the real one.)

**Severity service (`services/severity.py`).** The level is already decided in the pipeline.
What's left for the API is whether the UI may say "contraindicated", and the rule is that only a
source's own label can say so. The data has exactly five such labels, so the code checks against
that exact set instead of searching text: `"OSCAR: CI"` or "not recommended" don't count, and
neither does `major` on its own. Warfarin + aspirin is major but not contraindicated;
sildenafil + nitroglycerin is both.

## 2026-10-26 — Search, validation and known-interactions API (commits 14–16)

**Request flow.** A request reaches `main.py`, which hands `/api/v1/drugs/...` to
`api/routes/drugs.py` and `/api/v1/interactions/...` to `api/routes/interactions.py`
(`include_router`). The route checks the input, calls a function in `services/`, and FastAPI turns
the returned dict into JSON shaped by a Pydantic model in `models/schemas.py`.

**Dependency injection.** `db: Session = Depends(get_db)` tells FastAPI: before calling this
function, call `get_db()` and pass in what it yields. `get_db` opens a session, `yield`s it, and
closes it after the response is sent, so no route can forget to close a connection.

**Search (`services/drugs.py`).** One SQL query ranks drugs in two tiers: names or synonyms that
*start with* the query first (`LIKE 'warf%'`), then typo matches by `similarity()` above 0.4.
`unnest(synonyms)` turns the synonym array into rows so each one can be compared. `%` and `_` in
the user's text are escaped first, otherwise typing `%` would match every drug. `Query(min_length=2)`
rejects one-letter searches before any SQL runs.

**Validation (`models/schemas.py`).** `@field_validator("drug_ids")` runs on every request body.
`list(dict.fromkeys(ids))` drops repeated IDs but keeps the order the user picked (a dict keeps
insertion order and can't hold a key twice). If fewer than 2 or more than 10 remain, raising
`ValueError` makes FastAPI answer 422 with the message. Unknown IDs need the database, so
`services/interactions.py` checks those and raises `HTTPException(422)` naming them.

**Known interactions (`services/interactions.py`).** `combinations(sorted(ids), 2)` lists every
pair once: 3 drugs give 3 pairs, 10 drugs give 45. Sorting first makes each pair come out as
`(smaller, larger)`, the same order as `pair_key` in the table, so one `WHERE pair_key IN (...)`
fetches them all through the index. Pairs with no row are returned as `pairs_without_record`:
no record in our sources is not proof the combination is safe, and the UI has to say that.

## 2026-10-26 — PostgreSQL tables and seed (commit 11)

**Problem.** The tables existed only as Parquet files. The API needs them in a database it can
query in milliseconds.

**Setup.** One database user just for the app (`pharmgraph`), owning one database
(`pharmgraph`), so a bug in the app can't touch anything else on the server. The connection
string, password included, lives only in `.env`, which Git ignores. `config.py` therefore has no
default for `DATABASE_URL`: without `.env` the app stops at startup with "Field required" rather
than silently connecting somewhere wrong.

**`app/core/database.py`.** `create_engine()` makes the *engine*, the object that knows how to
reach the database and keeps a pool of open connections. It doesn't connect until first used.
`sessionmaker()` makes *sessions*: one unit of work where you read or write and then commit.
`pool_pre_ping=True` checks a pooled connection is alive before handing it out.

**`app/models/tables.py`.** Each class is a table, each `mapped_column` a column.
`Mapped[str | None]` means the column may be empty (NULL); plain `Mapped[str]` means it may not.
The rules from the data dictionary are also *constraints*, rules PostgreSQL enforces on every
insert:
- `CheckConstraint("severity_display IN (...)")`: severity can only be one of four words.
- `CheckConstraint("drug_a_id < drug_b_id")`: pairs are always stored sorted.
- `ForeignKey("drugs.drug_id")`: an interaction can only name a drug that exists.
- `UniqueConstraint("pair_key", "interaction_type")`: no repeated interaction. It also builds an
  index on `pair_key`, which is what makes pair lookups fast.

Tested by inserting three bad rows by hand: all three were refused.

**`app/seed.py`.** Drops and recreates both tables, then inserts in batches of 10,000 rows.
`records()` converts pandas' `NaN` (missing) into Python's `None`, which the database stores as
NULL. `ANALYZE` at the end collects statistics; before it, PostgreSQL guessed 558 rows for a
single pair, after it, 1, and the lookup takes 0.05 ms.

**`pg_trgm`.** A PostgreSQL extension that splits text into three-letter pieces and scores how
many two strings share. "warfrin" vs "warfarin" scores 0.55; that's what the search API (commit
14) will use to forgive typos.

## 2026-10-26 — `ml/pipelines/quality_report.py` (commit 9)

**Problem.** Quality numbers lived in script output and chat. A report typed by hand goes
stale the moment the data changes.

**Approach.** The script reads the real files and *writes* `docs/data-quality-report.md`.
Nobody edits the `.md`; rerunning the script refreshes it.

- `sha256()` reads the file in 1 MB chunks: `iter(lambda: f.read(1 << 20), b"")` keeps calling
  `f.read` until it returns empty bytes. `1 << 20` is 2 to the power 20, i.e. 1,048,576. Chunks
  mean a 400 MB file never has to fit in memory at once.
- `input_files()` compares each fingerprint in `data/checksums.txt` with the file on disk. A
  mismatch means someone's data differs from the recorded version.
- `severity_section()` rebuilds the coverage in the order sources were added. For each graded
  pair it collects the sources that really grade it, leaving out `DDInter: Unknown` (a record
  with no grade), then counts how many pairs are covered as each group of sources is added.
- The orphan check asks: does every `drug_a_id` and `drug_b_id` exist in the drugs table?

**Learned.** The first hand count of "graded by two or more sources" was 33,719. It counted
DDInter's "Unknown" as a grade. The script, counting only real grades, gives 32,742. A script
with a written-down rule caught a mistake the hand count made.

## 2026-10-26 — `ml/pipelines/build_tables.py` (commits 8 and 10)

**Problem.** The data sat in separate files: TDC pairs, merged severity, drug names from three
sources. The backend needs two clean tables it can load straight into PostgreSQL.

**Output.** `data/processed/drugs.parquet` (one row per drug) and
`data/processed/known_interactions.parquet` (one row per documented interaction).

### `pick_names()`

Collects every name each DrugBank ID has in DDInter, K-Paths, PubChem and the Ayvaz set, then
picks one with a sort key of three parts:

```python
key=lambda c: ("(" in c[1], NAME_PRIORITY[c[0]], len(c[1]))
```

(The real key has one more part, `len(c[1]) > READABLE_NAME`, explained below.)

Python sorts tuples part by part, left to right. `False` sorts before `True`, so plain names
come before names with a bracket ("Ketorolac" before "Ketorolac (ophthalmic)"), and short names
before names over 40 characters. Ties go to the more trusted source (`NAME_PRIORITY`: DDInter 0,
K-Paths 1, PubChem 2, Ayvaz 3), then the shorter spelling.

Some drugs only have a PubChem title, and that title can be a full IUPAC name hundreds of
characters long. For those, PubChem's *first* synonym is offered too, but only if it looks like
a word. Later synonyms aren't trusted: for DB00568 the first word-like one is "Cinna", a brand
fragment, and a wrong name in a medicine app is worse than a long correct one. Seven drugs keep
their long chemical names for that reason.

### `clean_synonyms()`

Brand names come first, because they're what people type ("Coumadin", not "warfarin"). They come
from RxNorm, through the OpenMRS knowledge base, which already filtered out junk, so they're
kept as they are. PubChem's own synonym lists mix real names with codes ("UNII-5Q7ZVV76EI", CAS
numbers), so those go through the regex `^[A-Za-z][A-Za-z \-']{2,39}$`: start with a letter,
then only letters, spaces, hyphens and apostrophes, 3–40 characters. `normalize()` (from
`map_ddinter_ids.py`) lowercases and trims, so "Coumadin" and "COUMADIN" count as one. At most
25 are kept.

The first version used only PubChem and capped the list at 15. Warfarin then had "Dethmor" and
"Kumader" (rat-poison trade names) but not "Coumadin", which wasn't in PubChem's first 60 at all.
That's why the RxNorm brands were added.

### `build_drugs()`

`enumerate(sorted(smiles), start=1)` hands out `pg_000001`, `pg_000002`... in DrugBank-ID order.
`f"pg_{i:06d}"` pads the number to six digits. Because the order is the same, a pair sorted by
`drug_id` comes out the same way round as one sorted by DrugBank ID, so the pipeline (which works
in DrugBank IDs) and the database (which works in `drug_id`s) can't disagree about which drug is
`drug_a`.

`supported_for_ml` is `Chem.MolFromSmiles(...) is not None`: RDKit returns `None` when it can't
read a SMILES. That's how DB11630 was caught.

### `build_interactions()`

- `t.ID1.map(drug_id)` looks each DrugBank ID up in a dict and returns the `drug_id`.
- `a.where(a < b, b)` keeps `a` where the condition is true and takes `b` elsewhere, so
  `drug_a_id` is always the smaller ID. The same trick the other way gives `drug_b_id`.
- The description replaces `#Drug1` with the name of `ID1` and `#Drug2` with `ID2`. TDC's
  sentences have a direction ("A increases the effect of B"), so this keeps TDC's own order,
  not the sorted one.
- Severity is looked up by the DrugBank pair key that `merge_severity.py` used. `.fillna("unknown")`
  fills pairs no source grades.

### `check()`

Stops the build with a `ValueError` if any rule from `docs/data-dictionary.md` breaks. A wrong
table should fail here, loudly, not later as a strange API answer.

**Things learned while building it**

- TDC's 406 "duplicate" pairs aren't duplicates: each is two different interaction types. The
  table key had to become `(pair_key, interaction_type)`.
- Having a SMILES string doesn't mean having a valid structure (DB11630).
