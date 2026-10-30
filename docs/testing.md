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

Automated tests (2026-10-26): `cd backend; ..\.venv\Scripts\python.exe -m pytest` → 18 passed
in 1.8 s. `tests/test_severity.py` (4) checks the contraindication labels. `tests/test_api.py`
(14) runs the endpoints through FastAPI's `TestClient` against the seeded database: health,
search by name / brand / typo, name matches before brand matches, a too-short query, warfarin + aspirin (major, not
contraindicated), sildenafil + nitroglycerin (contraindicated), a pair with no record
(bivalirudin + goserelin) listed in `pairs_without_record`, three drugs → three pairs, an
unknown ID, selections of 0, 1, the same drug twice and 11 drugs, and the `X-Request-ID`
header. The API tests skip themselves if the database isn't seeded. Not tested yet: the 500
handler, since nothing triggers an unexpected error on purpose.

The first search run used pg_trgm's default cut-off of 0.3 and returned look-alike brands
("lipitor" also gave Lamotrigine through "Lamitor", 0.33). Real typos scored 0.55–0.67, so the
cut-off is now 0.4. Error responses don't share one shape yet; that's commit 17.

`build_tables.py` runs its own checks every time (see `check()`): unique `drug_id`, one
`drug_id` per DrugBank ID, unique `(pair_key, interaction_type)`, sorted pair, both drugs exist,
no `#Drug` placeholder left, severity in the enum. The build stops if any fails.

## Model inputs and baseline

| Date | What was checked | How | Result |
|---|---|---|---|
| 2026-10-26 | Fingerprints | `python -m ml.pipelines.featurize` | X 1,705 × 2,048 float32, aligned `drug_ids`; bits set per drug median 42 (min 1, max 162); 28 drugs share a fingerprint with another; DB11630 left out |
| 2026-10-26 | Edge split | `python -m ml.graph.split_edges` | train 133,974 / val 28,708 / test 28,710 positives, same number of negatives each; no pair in two of the six parts; 10 pairs dropped (DB11630) |
| 2026-10-26 | Graph | `python -m ml.graph.build_graph` | `Data(x=[1705, 2048], edge_index=[2, 382784])`, undirected, no self loops, no isolated drug; median degree 182, max 913; its 191,392 pairs equal the split's positives; warfarin–aspirin edge present |
| 2026-10-26 | Logistic regression baseline | `python -m ml.models.baseline_sklearn` (69 s) | val AUROC 0.877, AUPR 0.859, F1 0.813; test AUROC 0.875, AUPR 0.858, F1 0.811; random scores on test AUROC 0.502, AUPR 0.501 |

The baseline sees each pair as `[x_u || x_v]`, the two fingerprints side by side, so it can
only learn which structures tend to interact. Negatives are uniform random pairs, which are
easier than real non-interacting pairs, and every test drug also appears in training. Both make
these scores optimistic for new drugs; the GCN will be scored on the same split.

## Frontend (against the running API, in the browser)

| Date | What was checked | Result |
|---|---|---|
| 2026-10-26 | `npx vite build` | builds (150 kB JS, 49 kB gzipped) |
| 2026-10-26 | typing `warfrin` | one result, Warfarin, after the 250 ms pause |
| 2026-10-26 | one drug selected | Check interactions disabled |
| 2026-10-26 | warfarin, aspirin, bivalirudin, goserelin → Check | goes to `#/results`; 3 documented pairs with severity and sources; the 3 goserelin pairs under "No record found" with the "does not mean the combination is safe" note |
| 2026-10-26 | sildenafil, nitroglycerin, dofetilide → Check | sildenafil–nitroglycerin shows Contraindicated + Major; sildenafil–dofetilide shows "Severity not reported by our sources" |
| 2026-10-26 | Potential (GNN) column | "model is not trained yet" message, no numbers |
| 2026-10-26 | `#/about/limitations` | four limitation boxes; nav marks the current page |
| 2026-10-26 | console | no errors except a missing `favicon.ico` (since fixed: inline icon) |
| 2026-10-26 | redesign: keyboard entry (type, Enter) for 6 drugs | 6 numbered lines, button reads "Check 15 pairs" |
| 2026-10-26 | redesign: 15-pair check | tally "1 contraindicated · 3 major · 1 moderate · 2 severity not reported · 9 no record"; contraindicated pair listed first, then major, moderate, unknown |
| 2026-10-26 | redesign at 1020 px and 375 px wide | no horizontal scroll; grade column stacks above the note on phones |
| 2026-10-27 | home page at 1280 px and 375 px | two columns (check sheet + "What you get / For clinicians / Coverage") on desktop, one column on phones; no horizontal scroll |
| 2026-10-27 | Download PDF | opens the browser's print dialog (choose "Save as PDF"); file name "PharmGraph AI interaction report 2026-10-27" in local date; print view hides nav and buttons, adds the report header and a footer with the check time and disclaimer |
| 2026-10-26 | search `war` | Warfarin first (was Podophyllotoxin, which only matched through a brand name); name matches now rank before brand-name matches |

## Structures, interaction map, dark theme (2026-10-29)

| Date | What was checked | Result |
|---|---|---|
| 2026-10-29 | first version (3D built inside the request), timed on all 1,706 drugs | Quinine 62.8 s, Dolasetron 36.2 s, Rifaximin 24.8 s, 30 drugs over 2 s; led to decision 14 |
| 2026-10-29 | `python -m ml.pipelines.conformers` | 1,706 drugs in 249 s: 1,609 with a 3D model (8 with stereochemistry not enforced), 97 2D only (70 over 60 heavy atoms, 25 RDKit couldn't embed, 1 timed out at 60 s: sodium stibogluconate nonahydrate, 1 SMILES doesn't parse) |
| 2026-10-29 | `python -m app.seed` | 1,706 drugs, 191,808 interactions; counts match the files |
| 2026-10-29 | `pytest` in `backend/` | 22 passed (4 new: warfarin has 2D + 3D and formula C19H16O4; bivalirudin is 2D only with a note; quinine's 3D model says stereochemistry wasn't enforced; unknown ID → 404 `structure_not_found`) |
| 2026-10-29 | `GET /drugs/{id}/structure` on 127.0.0.1 | warfarin 0.017 s, quinine 0.017 s, dolasetron 0.031 s, aspirin 0.022 s, bivalirudin 0.48 s (2D drawing of 155 atoms) |
| 2026-10-29 | `npm run build` | builds; main JS 165 kB (54 kB gzipped), 3Dmol in its own chunk 588 kB (170 kB gzipped), loaded only on first 3D view. Warnings: chunk over 500 kB, and 3Dmol's own use of `eval` |
| 2026-10-29 | headless Chromium (Playwright, software WebGL) at 1366 px and 390 px: warfarin, aspirin, quinine, sildenafil → Check | no console errors; one 3D canvas; map draws 6 lines for 6 pairs; colours match the list (sildenafil–nitroglycerin thick red as contraindicated in an earlier run); quinine shows its stereo note; 2D toggle shows the RDKit drawing; hero molecule spins on a transparent background |
| 2026-10-29 | print preview (`emulateMedia print`) | dark-on-white, 3D panel hidden, map and cards readable |

## Accounts, history, rate limits, security (2026-10-30)

| Date | What was checked | Result |
|---|---|---|
| 2026-10-30 | `python -m app.seed` | rebuilt `drugs` and `known_interactions`; `users`, `user_sessions`, `saved_checks` created; account tables untouched by later reseeds |
| 2026-10-30 | `pytest` in `backend/` | 35 passed: the 22 earlier tests (now signed in) and 13 in `test_auth.py`: register signs in and stores only a scrypt hash; cookie is HttpOnly and SameSite=Lax; short password, missing consent and bad email → 422; duplicate email (any case) → 409; wrong password and unknown email get the same 401; logout ends the session; search, check and history → 401 without a session, structure stays public; checks saved newest first and deletable; another user's check → 404; deleting the account removes it and its history; 6th login in a minute → 429 with Retry-After; security headers present; POST with a foreign Origin → 403 |
| 2026-10-30 | account tables after the test run | 0 users, 0 sessions, 0 checks: tests delete what they create |
| 2026-10-30 | `hash_password` timing | 1.2 s per hash on the dev laptop |
| 2026-10-30 | `npm run build` | builds; CSP `<meta>` in `dist/index.html`; main JS 176 kB (56 kB gzipped) |
| 2026-10-30 | headless Chromium against `vite preview` (production build with CSP) | landing renders the 3D molecule; `#/check` signed out shows Sign in; register → `#/check` with the email in the header; cookie `pg_session` HttpOnly, SameSite=Lax, and `document.cookie` is empty; warfarin + aspirin check → results; History shows it; Check again → results and a second history entry; Sign out → landing, cookie gone; `#/history` asks to sign in; sign back in → both checks there; Delete my account → landing, and signing in again says "email or password is wrong"; repeated tries → "too many requests; try again in 47 s"; 390 px landing has no horizontal scroll; **no console errors** (no CSP violations) apart from the expected 401/429 responses |
| 2026-10-30 | first browser run | found the Vite proxy rewriting `Host`, so the origin check refused register with 403 when the page wasn't on `localhost:5173`; fixed with `changeOrigin: false` |

## Redesign, drug pages, mapping, graph (2026-10-30, evening)

| Date | What was checked | Result |
|---|---|---|
| 2026-10-30 | `python -m ml.pipelines.identifiers` | 1,706 drugs: DDInter ids 1,241, KEGG ids 1,423, InChIKey 1,701; warfarin → DDInter1951, D08682, `PJVWKTKQMONHTI-UHFFFAOYSA-N` (the key DrugBank's warfarin page shows) |
| 2026-10-30 | `pytest` in `backend/` | 42 passed: 35 earlier (one rewritten: search, check, structure and stats are now public; list, detail and history aren't) + anonymous check not saved + 6 in `test_catalog.py` (paging, bad page → 422, identifier mapping for warfarin, partners worst-first and counted, unknown drug → 404, stats equal the data) |
| 2026-10-30 | worst-case drug detail | Phenobarbital: 913 partners, 178 KB, 0.29 s; gzip on (`content-encoding: gzip`) |
| 2026-10-30 | `GET /stats` | 1,706 drugs, 191,402 pairs, 85,756 graded, 1,609 with 3D; severity 20,197 major, 61,257 moderate, 4,302 minor, 105,646 unknown |
| 2026-10-30 | `npm run build` | builds; main JS ~129 kB gzipped (Motion is most of the growth from 56 kB), 3Dmol 170 kB gzipped loaded on demand |
| 2026-10-30 | headless Chromium against `vite preview` (production build, CSP on) | intro: logo centred with name, then flies into the header; hero 3D molecule, glass badges, parallax and spinning floor ring render; every landing section reaches opacity 1 once scrolled to; 2 WebGL canvases; anonymous quick check shows results on the landing page with the "not saved" note and the URL stays `#/`; mega-menu opens with three columns; Ctrl K palette finds warfarin; drug list shows thumbnails and counts; warfarin's page shows identifiers, 3D, severity bar, a network with all four severities, and "Show 40 more"; research graph opens all modules and shows join ids; light theme switches; 390 px has no horizontal scroll; no console errors |
| 2026-10-30 | auth end-to-end (updated for the avatar menu) | register, HttpOnly cookie unreadable by JS, check, history, check again, sign out, sign back in, delete account, refused login, 429 after repeated tries: all pass, no console errors |
| 2026-10-30 | bugs found by looking at the screenshots | the platform ring spun as a flat ellipse (fixed: tilted circle); the showcase showed warfarin under the "Sildenafil" button while loading (fixed: old model cleared); scrolling over the hero zoomed the molecule and blocked page scroll (fixed: `nomouse`); the drug network was all red because only 40 partners were sent (fixed: all partners, sampled by severity) |

## Speed fix and drug explanations (2026-10-30, night)

| Date | What was checked | Result |
|---|---|---|
| 2026-10-30 | idle landing page, CDP metrics (headless, production build) | before: main thread 100% busy, 5–8 fps; CPU profile showed 72.7% in 3Dmol `setViewport`, re-measuring the page every spinning frame while endless Motion loops kept it dirty. After pausing off-screen molecules and moving the float loops to CSS `translate`: `setViewport` 0.1%, about 40% busy, 54 fps without a GPU; 0% with reduced motion |
| 2026-10-30 | `python -m ml.pipelines.descriptions` | first run 1,468 / 1,706 (aspirin missing: its synonyms are brand names); with PubChem titles 1,509 / 1,706 |
| 2026-10-30 | `pytest` in `backend/` | 43 passed (new: search summary and drug-page description for warfarin; history entries carry summaries) |
| 2026-10-30 | search shows the synonym that matched | "aspirin" → Acetylsalicylic acid (matched "Bayer Aspirin"), Cefotiam (matched "Aspil"); "coumadin" → Warfarin (matched "Coumadin"); "warfarin" shows none; ranking unchanged; about 55 ms a search; `pytest` 44 passed |
| 2026-10-30 | browser: landing quick check and warfarin's page | dropdown shows each drug's first MeSH sentence; added lines show it; field reads "Add a drug"; "What is Warfarin?" card with MeSH D014859 link; no console errors |

## Not yet tested

- Prediction endpoint is still a placeholder; no GCN yet.
- Frontend: no automated tests; checked by hand in the browser at desktop and phone width. The
  "can't reach the server" message was not triggered in the browser.
- 3D view not tried on a real phone GPU, nor with WebGL turned off (the fallback message is
  untested). Reduced-motion was not switched on in a test run.
- The 3D models were looked at for a handful of drugs only; no chemist has checked them.
- Not tested over HTTPS: the `Secure` cookie flag and HSTS (`HTTPS=true`) have never been on.
- Rate limits not tested with several uvicorn workers or behind a proxy (they would not hold).
- No load test of concurrent logins (each hash takes 128 MiB).
- No security scan or penetration test; no email verification or password reset exists.
- The intro, parallax, spotlight and tilt effects were seen only in headless Chromium with software
  WebGL; not on Firefox, Safari, a real phone or a low-end laptop GPU.
- The light theme was looked at on the landing and drug pages only; not every page was reviewed.
- Keyboard use of the knowledge graph (Tab, Enter) and the mega-menu was not tested with a screen
  reader.
