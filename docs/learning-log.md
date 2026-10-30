# Learning log

What was built, how it works, and the concepts behind it. Newest first.

## 2026-10-30 — Redesign: intro, mega-menu, drug pages, identifier mapping, nested graph

### Backend
- `ml/pipelines/identifiers.py`: `groupby(...).agg(lambda ids: sorted(set(ids)))` collects every id
  for a key into one sorted list. `str.removeprefix("dr:")` strips KEGG's prefix. `Chem.MolToInchi`
  and `Chem.MolToInchiKey` compute the standard identifiers from the molecule.
- `services/catalog.py`: `PARTNERS_SQL` uses PostgreSQL's `DISTINCT ON (partner_id)` with
  `ORDER BY partner_id, rank`, which keeps the first (most severe) row per partner.
  `array_position(ARRAY['major',...], severity)` turns a severity into its rank. The `UNION` in
  `interaction_counts` counts each pair once per drug, whichever side the drug is on.
- `services/auth.py` `optional_user`: wraps `current_user` and returns `None` instead of raising,
  for endpoints that work either way.
- `GZipMiddleware(minimum_size=1024)`: compresses only responses big enough to be worth it.

### Frontend
- `App.jsx` `currentRoute()`: the regex `^#\/([^/]*)\/?(.*)$` splits `#/drugs/pg_000472` into the
  page (`drugs`) and the id (`pg_000472`).
- `Brand.jsx`: the intro's logo and the header's logo use the same `layoutId`. When the intro
  unmounts and the header logo mounts, Motion measures both boxes and animates between them.
  `AnimatePresence` keeps the intro on screen long enough to play its `exit` fade.
- `Landing.jsx` `usePointer` + `Layer`: `useMotionValue` holds the pointer position without
  re-rendering React; `useSpring` smooths it; `useTransform(sx, (v) => v * depth * 46)` turns it
  into each layer's offset, so deeper layers move further. `PhoneMock` uses `useScroll` +
  `useTransform` so the phone's rotation follows the page's scroll position.
- `CountUp`: `animate(0, value, { onUpdate })` writes the number straight into the DOM node, so
  counting doesn't re-render React 60 times a second.
- `SpotlightCard`: the pointer position goes into CSS custom properties (`--mx`, `--my`) that a
  `radial-gradient` reads, which gives the light that follows the cursor.
- `KnowledgeGraph.jsx`: modules and tables are data; positions are computed from whether a module
  is open. `motion.circle animate={{ r }}` and `motion.path animate={{ d }}` morph the shapes;
  the path always has the same commands (`M … Q …`), which is what lets Motion interpolate it.
  Dragging changes a `{x, y, k}` view state applied to one `motion.g`.
- `Molecule3D`: `nomouse` stops 3Dmol listening to the mouse on decorative models.

**Things learned while building it**
- A stitched full-page screenshot never scrolls, so scroll-triggered reveals look blank in it.
  Checking each section's computed opacity after scrolling to it showed they all reach 1.
- 3Dmol zooms on the mouse wheel: over a full-width hero that swallowed page scrolling.
- Showing a new label while the old molecule is still loaded looked like a data error; clearing
  the old one first fixed it.

## 2026-10-30 — Landing page, accounts, history, rate limits, security

### How a signed-in request travels

```
browser ──POST /api/v1/auth/login {email, password}──> login(): scrypt-hash the password, compare
        <──Set-Cookie: pg_session=<random token>; HttpOnly; SameSite=Lax── start_session(): store SHA-256(token)
browser ──GET /api/v1/drugs/search (cookie sent automatically)──> RateLimit → current_user() → search
```

### Backend

- `services/auth.py`
  - `hash_password()`: `secrets.token_bytes(16)` is the salt. `hashlib.scrypt(...)` mixes
    password and salt with N=2^17 rounds over 128 MiB. The result string keeps N, r, p and the
    salt, so `password_matches()` can redo the same hash and compare.
  - `hmac.compare_digest(a, b)` compares in constant time. A normal `==` stops at the first
    different character, and the time difference can leak how much matched.
  - `DUMMY_HASH`: when the email doesn't exist we still hash, so the answer takes as long as for
    a wrong password.
  - `start_session()`: `secrets.token_urlsafe(32)` makes 32 random bytes; only its SHA-256 goes in
    the database. `response.set_cookie(..., httponly=True, samesite="lax", secure=settings.HTTPS)`.
  - `current_user()` is a FastAPI *dependency*: `Depends(current_user)` in a route runs it first;
    if it raises 401 the route body never runs. FastAPI reuses one `get_db()` per request, so the
    route and the dependency share a database session.
- `services/history.py`: `delete(...).where(SavedCheck.id == check_id, SavedCheck.user_id == user_id)`
  deletes only your own row; `.rowcount` says whether anything matched, and 0 becomes 404.
- `core/rate_limit.py`: a class with `__call__` can be used like a function, so
  `Depends(AUTH_LIMIT)` works. `deque` drops old times from the left in O(1); the window keeps
  only the last 60 seconds. `RateLimit.hits` is a class attribute, one dict shared by every limit,
  which is why the tests can clear it in one line.
- `core/security.py`: an HTTP middleware wraps every request: it can refuse before the route runs
  (403, 413) and add headers after. `urlsplit(origin).netloc` gives `host:port` to compare with the
  `Host` header.
- `schemas.py`: `Literal[True]` accepts only `true`, so registering without the consent box is a
  422. `field_validator(..., mode="before")` runs before the pattern check, so `" A@B.com "` is
  trimmed and lowercased first.
- `seed.py`: `drop_all(engine, tables=[...])` drops only the listed tables.

### Frontend

- `api.js`: `onSignedOut(handler)` stores one callback; `request()` calls it whenever the server
  answers `not_signed_in`. One place handles an expired session for the whole app.
- `App.jsx`: `user` has three states. `undefined` means still asking the server, `null` means
  signed out, an object means signed in. Private routes render the sign-in form when `user` is
  `null`, so after signing in the same URL shows the page you wanted. `forget()` clears the
  selection and the last report on sign-out, for shared computers.
- `AuthForm.jsx`: `autoComplete="new-password"` / `"current-password"` lets password managers
  help; `required` and `minLength` give instant browser checks, and the API checks again.
- `Landing.jsx`: `useReveal()` creates one `IntersectionObserver` and adds `shown` to each
  `.reveal` element when it enters the screen, then stops watching it. `MoleculeShowcase` changes
  `index` every 8 s with `setInterval` (not when the OS asks for reduced motion) and gives
  `Molecule3D` a new `key`, so React builds a fresh viewer for each molecule.
- `styles.css`: `.tilt-card:hover { transform: perspective(800px) rotateX(4deg) rotateY(-5deg) }`
  is the 3D tilt; `transition` animates it.
- `vite.config.js`: a small Vite plugin with `apply: 'build'` and `transformIndexHtml` adds the CSP
  `<meta>` to the built page only.

**Things learned while building it**

- The first browser run failed with 403: Vite's string proxy shorthand sets `changeOrigin: true`,
  which rewrites `Host`, so the origin check thought the page was another site. Tests with
  `TestClient` couldn't catch it; only the real browser path did.
- The scrypt cost was measured at 1.2 s per hash, not the 0.3 s first guessed. Measure before
  writing numbers down.

## 2026-10-29 — Molecule structures (2D/3D), interaction map, dark theme

### Backend: `GET /api/v1/drugs/{drug_id}/structure`

`services/structure.py`:

- `Chem.MolFromSmiles(smiles)` turns the SMILES text into an RDKit molecule object, or `None`
  if it can't be read. `None` (or an unknown `drug_id`) becomes a 404 with
  `error: "structure_not_found"`, through the same `HTTPException(detail={...})` shape
  `interactions.py` uses.
- `rdMolDescriptors.CalcMolFormula(mol)` gives the formula (`C19H16O4`), `Descriptors.MolWt(mol)`
  the average molecular weight in g/mol, `mol.GetNumHeavyAtoms()` the count of non-hydrogen atoms.
- `draw_svg()`: `MolDraw2DSVG(420, 320)` is a drawing canvas that outputs SVG text.
  `SetDarkMode` switches to light lines on dark; `clearBackground = False` removes the black
  rectangle so the card's own background shows through. `DrawMolecule` computes 2D positions and
  draws; `FinishDrawing` + `GetDrawingText` returns the SVG string.
- `molblock` and `note_3d` are read from the `drugs` row: nothing 3D is computed here.
- In the route, `/{drug_id}/structure` is a *path parameter*: FastAPI takes whatever is in that
  position of the URL and passes it to the function as `drug_id`.

### Pipeline: `ml/pipelines/conformers.py`

- `Chem.AddHs(mol)`: SMILES leaves hydrogens implicit; 3D needs them as real atoms.
- `ETKDGv3()` holds the embedding settings. `randomSeed = 42` makes the result repeatable.
  `maxIterations = 20` caps the attempts. `enforceChirality` says whether the 3D shape must match
  the `@`/`@@` stereo tags.
- `EmbedMolecule(mol, params)` returns `0` on success, `-1` on failure.
- `MMFFOptimizeMolecule(mol)` relaxes bond lengths and angles towards a low-energy shape.
- `Chem.MolToMolBlock(mol)` writes atoms with x, y, z and the bond list as text.
- `Pool().map(conformer, smiles, chunksize=4)`: `multiprocessing` starts one worker per CPU
  core and splits the list between them. `if __name__ == "__main__"` is required on Windows,
  where each worker re-imports the file.

**Things learned while building it**

- Embedding time doesn't follow size. Quinine, 24 heavy atoms, took 62.8 s, because the `[N@]`
  stereo tag on its bridgehead nitrogen can't be satisfied, so RDKit kept retrying. Measuring
  all 1,706 drugs found this; testing three examples wouldn't have.
- Slow, unpredictable work belongs offline. A web request should only read.
- `maxIterations` wasn't enough on its own: the first full run hung on one molecule, and
  `Pool.map` waits for every task. `build_all()` uses `pool.imap(...)` and
  `next(timeout=60)`; on a timeout it leaves the `with Pool()` block (which kills the workers),
  records the molecule as 2D only and starts a new pool after it. It caught sodium
  stibogluconate nonahydrate.

### Frontend

- `Molecule3D.jsx`: `useRef` gives a handle on the `<div>` that 3Dmol draws into. `useEffect`
  runs after React has put that div on the page. `import('3dmol')` is a *dynamic import*: it
  returns a Promise and makes Vite split the library into its own file, downloaded only now.
  The function returned from `useEffect` is the *cleanup*: it stops the spin and empties the
  div when the drug changes or the page is left, so WebGL canvases don't pile up. `cancelled`
  covers the case where the user leaves before the import finishes.
  `matchMedia('(prefers-reduced-motion: reduce)')` reads the OS motion setting.
- `MoleculePanel.jsx`: fetches the structure whenever `activeId` changes. `AbortController`
  cancels the previous request if the user clicks another drug quickly, so an old answer can't
  overwrite a newer one. The 2D SVG goes into an `<img>` as a `data:` URL instead of being
  inserted as HTML (`dangerouslySetInnerHTML`), so no markup from the response ever runs in the
  page.
- `InteractionMap.jsx`: node *i* of *n* sits at angle `-π/2 + i·2π/n`, i.e. at
  `(cx + r·cos θ, cy + r·sin θ)`, starting at the top. Interactions arrive sorted worst-first,
  so the first one seen per pair sets that line's colour; they are drawn in reverse so the worst
  lines end up on top. `<title>` inside an SVG element is its hover tooltip.
- `ResultsPanel.jsx`: `activeId` is *lifted state*. It lives in the parent so that clicking a
  node in the map and clicking a chip in the molecule panel change the same value.
- CSS: the colours are custom properties (`--major`, `--paper`...), so the dark theme was mostly
  new token values, and `@media print` sets them back to dark-on-white. `.note` uses
  `--sev` and `border-left: 3px solid var(--sev)` so one rule colours every severity.
  `stroke-dasharray` / `stroke-dashoffset` with a keyframe animate the map lines "drawing in".
  `backdrop-filter: blur()` gives the frosted header.

## 2026-10-26 — Frontend redesign

**Why.** The first version was a dark gradient template with cards and pills that could belong
to any app. The redesign treats a check as a prescription under review: medicines are numbered
lines on one white sheet, and each pair gets a note with its grade on the left and the source
under it. Light theme, because clinical tools are used in bright rooms and the demo runs on a
projector. Product facts and audiences are in `docs/PRODUCT.md`.

**Design tokens.** All colours live as CSS custom properties on `:root` (`--ink`, `--rule`,
`--blue`, `--major`...). `var(--blue)` reads one, so changing a colour is one edit.

**Severity by shape, not only colour.** `SeverityMark` in `ResultsPanel.jsx` draws a small SVG:
filled circle for major, half-filled for moderate, outline for minor, dashed for not reported.
The word is always next to it, so the grade survives colour blindness and black-and-white print.

**Worst first.** `rank()` sorts contraindicated pairs first, then major → moderate → minor →
unknown. The data isn't changed, only the order on screen.

**Combobox search.** The input has `role="combobox"`, the list `role="listbox"` and each result
`role="option"`; `aria-activedescendant` tells screen readers which option the arrow keys are on.
↑/↓ move, Enter adds, Escape clears. `onMouseDown` + `preventDefault()` adds a drug without the
input losing focus first.

**`display: contents`** on the source rows lets each `<dt>`/`<dd>` pair sit directly in the
parent grid, so the labels line up in one column.

**Report download.** "Download PDF" calls `window.print()`; the browser's "Save as PDF" makes
the file. An `@media print` block in `styles.css` hides the nav and buttons, shows the
`.print-only` header and footer, and `break-inside: avoid` keeps one interaction from splitting
across pages. `document.title` is set for a moment first, because browsers use it as the PDF's
file name. No PDF library is needed.

**Search ranking.** `ORDER BY name_prefix DESC, prefix_hit DESC, score DESC` in
`services/drugs.py`: a drug whose own name starts with the query now beats one that only
matched through a brand name.

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
