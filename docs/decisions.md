# Decision log

Decisions that shape the project, with the reasons behind them. The point is that in a month,
or in the viva, we can answer "why did you do it this way?" without reconstructing the
argument from memory.

Format follows Michael Nygard's architecture decision records: context, decision,
consequences. Records are numbered and never renumbered. If we change our minds, the old
record stays and is marked *superseded* with a pointer to the new one.

| # | Decision | Status | Date |
|---|---|---|---|
| 1 | Keep documented and predicted interactions apart | Accepted | 2026-09-23 |
| 2 | One internal drug ID and a canonical pair key | Accepted | 2026-09-23 |
| 3 | Severity only from sources | Accepted | 2026-09-23 |
| 4 | GCN link prediction following DPDDI, judged on AUPR | Accepted | 2026-09-23 |
| 5 | Raw data stays out of git, tracked by checksum | Accepted | 2026-09-23 |
| 6 | TDC and DDInter instead of DrugBank | Accepted | 2026-10-08 |
| 7 | Merging severity: most severe wins, raw labels kept | Accepted | 2026-10-08 |
| 8 | No model-predicted severity | Accepted | 2026-10-08 |
| 9 | Add the Ayvaz merged dataset as a severity source | Accepted | 2026-10-09 |
| 10 | Match KEGG drugs by structure, salts included | Accepted | 2026-10-09 |
| 11 | PostgreSQL for the app database | Accepted | 2026-10-09 |
| 12 | Map the remaining DDInter drugs by exact name | Superseded by 13 | 2026-10-11 |
| 13 | Full DDInter data, mapped by DDInter's own DrugBank links | Accepted | 2026-10-11 |

---

## 1. Keep documented and predicted interactions apart

**Context.** The app shows two kinds of claims. Documented interactions come from curated
sources. Predicted ones are a model score that nobody has checked. In one list, a user can't
tell which claims have evidence behind them, and a confident-looking prediction reads like a
fact.

**Decision.** Every result carries `result_type`, either `known` or `potential_gnn`. The API
returns them from separate endpoints and the UI renders them in separate, visually different
sections. No code path concatenates them.

**Consequences.** The frontend has two tables instead of one, and sorting across both isn't
possible. That's intended. A pair can appear in both sections (documented, and also scored by
the model); the UI shows the documented entry first.

## 2. One internal drug ID and a canonical pair key

**Context.** Each source has its own identifiers (DrugBank, DDInter, KEGG, PubChem), and
sources list the same interaction from both drugs' sides, so (A, B) and (B, A) show up as two
records.

**Decision.** Every drug gets our own `drug_id` (`pg_` + 6 digits). Every pair is keyed by
`pair_key = "__".join(sorted([a, b]))`, with a unique constraint in the database. External IDs
are mapped onto ours in the pipeline, never at request time.

**Consequences.** Duplicates collapse on insert. Mapping errors show up in one place, the
pipeline, where the quality report can count them. The cost is that every new source needs
its own mapping step.

## 3. Severity only from sources

**Context.** Severity (major, moderate, minor) is the part of the output a user is most likely
to act on. A wrong "minor" on a dangerous pair is the worst mistake the app can make.

**Decision.** Severity is shown only when a source record gives one, mapped to
`major | moderate | minor | unknown`. Unmapped or missing values become `unknown`. The word
"contraindicated" appears only if the source's own label says it. Predictions carry no
severity at all.

**Consequences.** Many pairs show `unknown` (see 6 and 8 for how many). The UI has to make
"severity not reported by our sources" read as a normal state, not an error.

## 4. GCN link prediction following DPDDI, judged on AUPR

**Context.** We needed one model we could build, train and explain in the time available.
DPDDI (Liu et al., BMC Bioinformatics 2020) shows that a GCN over the known-interaction graph,
with a simple pair decoder, works well for this task.

**Decision.** Two-layer GCN encoder over drug nodes with Morgan fingerprint features (radius
2, 2048 bits), concatenation of the two drug embeddings, MLP with sigmoid. Edge-level 70/15/15
split with validation and test edges removed from the training graph. Logistic regression on
the pair's fingerprints is the baseline. AUPR on the test set is the primary metric, because
real interactions are rare among all possible pairs and AUROC flatters that.

**Consequences.** Drugs with no known interactions (cold start) get no useful embedding, so we
don't predict for them. If the GCN doesn't beat the baseline on AUPR, we report it and ship the
documented-interaction checker.

## 5. Raw data stays out of git, tracked by checksum

**Context.** Several of our sources forbid redistribution, and the files are large (the TDC
file alone is 44 MB).

**Decision.** `data/raw/` and `data/processed/` are gitignored. Each downloaded file gets a
line in `data/checksums.txt`: SHA-256, filename, source and access date. Download steps live
in `data/README.md`.

**Consequences.** Each member downloads the data once. A checksum mismatch tells us
immediately that someone has a different version.

## 6. TDC and DDInter instead of DrugBank

**Context.** The plan used DrugBank as the main source. DrugBank's academic download wasn't
available to us from India, and its severity field is only in the paid product anyway.

**Decision.** The interaction graph comes from TDC's DDI DrugBank dataset (Harvard Dataverse
file 4139573): 191,402 unique pairs over 1,706 drugs, keyed by DrugBank IDs, with SMILES for
every drug. Severity comes from DDInter 2.0 (CC BY-NC-SA 4.0), joined through a DDInter to
DrugBank ID map built from the K-Paths DDInter dataset on Hugging Face (1,543 IDs, none
ambiguous).

**Consequences.** We keep DrugBank IDs without needing DrugBank's licence. DDInter alone gives
a severity for only 13.9% of TDC pairs: its bulk download leaves out six ATC groups (C, G, J,
M, N, S), and 634 of our drugs aren't in DDInter at all. We've asked the DDInter authors for
the full files.

## 7. Merging severity: most severe wins, raw labels kept

**Context.** Once there's more than one source, they disagree. On pairs graded by both DDInter
and the Ayvaz set, the level matches only about 60% of the time. Published comparisons of
commercial checkers find the same thing (Fleiss' kappa 0.162 across Drugs.com, Lexicomp and
Epocrates; Pinkoh et al., PLOS ONE 2023).

**Decision.** When sources disagree, we display the most severe level. Every source's original
label is kept in `severity_raw`, and conflicts are counted in the data quality report.

**Consequences.** Erring towards the higher level means some pairs look worse than one of the
sources says. For a safety tool that's the right direction. Anyone checking a pair can see
exactly which source said what.

## 8. No model-predicted severity

**Context.** With 13.9% coverage, filling the gaps with a severity classifier was tempting.
Published severity models reach only about 0.67 to 0.71 recall on the most severe class
(DeepARV, npj Syst Biol Appl 2024), so roughly three in ten truly major pairs would be shown as
less serious. The labels such a model learns from also disagree with each other (see 7).

**Decision.** We don't predict severity for display. Missing severity stays `unknown`. Coverage
is raised only by adding real sources.

**Consequences.** Coverage stays partial, and the limitations doc states the measured number.
A severity model could still be trained and reported as a research result, but it would never
feed the UI.

## 9. Add the Ayvaz merged dataset as a severity source

**Context.** Ayvaz et al. (J Biomed Inform 2015) merged 14 public DDI sources and mapped them
to DrugBank IDs. Seven of them carry a severity grade: the French ANSM thesaurus, KEGG (2014
snapshot), NDF-RT, OSCAR, WorldVistA and the two ONC expert lists. The file is public on
GitHub (`dbmi-pitt/public-PDDI-analysis`) but has no licence file.

**Decision.** Load the conservative merged file with `ml/pipelines/load_ayvaz.py` and map each
source's labels to our enum. Contraindication, ANSM "association déconseillée" and WorldVistA
"not recommended", NDF-RT critical, OSCAR 3 and ONC high-priority become major. ANSM précaution
d'emploi, NDF-RT significant, OSCAR 2 and KEGG precaution become moderate. ANSM "à prendre en
compte", OSCAR 1 and ONC non-interruptive become minor. We checked the OSCAR scale against its
source file: MAOI + opioid is rated 3, aspirin + warfarin 2. Labels that name several levels at
once are left unmapped.

**Consequences.** Severity coverage of TDC pairs rises from 13.9% to 25.8% (49,299 pairs). The
data is from 2014 and 2015, so newer drugs aren't covered. We cite the paper and don't
redistribute the file. KEGG's "precaution" is broad, so mapping it to moderate is an
approximation. Under decision 7 it can never lower a level another source gives.

The repo also has a "not conservative" file. Per the paper, the difference is only in drug
mapping: the conservative file needed an InChI match *and* a name match to DrugBank, the other
accepts either. We loaded both: the looser file adds 127 graded TDC pairs (28.12% to 28.19%),
not enough to justify the looser mapping, so we stay with the conservative one.

## 10. Match KEGG drugs by structure, salts included

**Context.** The live KEGG DDI API has far more pairs than the 2014 snapshot, but KEGG entries
no longer link to DrugBank. KEGG also lists many drugs as salts (D00564 is warfarin sodium),
while TDC lists the parent drug. The data dictionary says we don't merge salt forms in our own
drug table.

**Decision.** `ml/pipelines/load_kegg.py` maps KEGG entries to TDC drugs by structure: KEGG's
own PubChem cross-reference gives a SMILES, we take the largest fragment (dropping the
counter-ion) and compare the first block of its InChIKey with the same key computed from TDC's
SMILES. Keys shared by more than one DrugBank ID are skipped. This applies only to attaching
external severity labels. Our drug table still keeps salts as separate records, as the data
dictionary says.

We first tried KEGG's own MOL files for the structures. They come ten to a call with no entry
ID on each record, and at KEGG's speed the 12,888 drugs would have taken hours, so we use
PubChem's batch endpoints and ask KEGG only for the DDI lists. On 22 entries checked both ways,
including warfarin sodium and ethinyl estradiol (whose MOL file carries explicit hydrogens),
the two routes gave the same key every time.

**Consequences.** 2,546 KEGG drugs map onto 1,504 of our 1,706 drugs. Warfarin alone has three
KEGG entries (D00564, D01280, D08682). The pull on 2026-10-11 gave 55,686 pairs (53,882 P,
2,016 CI or CI,P). KEGG grades 30,814 TDC pairs, 8,228 of them graded by no other source, and
takes severity coverage of TDC pairs from 40.3% to 44.8%. Because KEGG's P maps to moderate and
the most severe level wins, some pairs DDInter rates minor now show as moderate; minor pairs
went from 5,085 to 4,302. An interaction KEGG records for a salt is attributed to
the parent drug. For DDI labels this is reasonable, since the interaction comes from the active
part of the molecule, but it's a matching rule, not an exact ID link. KEGG data can't be
redistributed, so its output stays in `data/raw/`.

## 11. PostgreSQL for the app database

**Context.** The plan allowed SQLite or PostgreSQL. SQLite is simpler to ship, but drug search
should tolerate typos, and we want the deployed demo to use a real database server.

**Decision.** PostgreSQL 16, through SQLAlchemy, configured by `DATABASE_URL`. Drug search uses
the `pg_trgm` extension for similarity matching on names and synonyms. Locally each member runs
PostgreSQL, natively or in Docker. The deployed demo uses a free hosted instance (Neon or
Supabase).

**Consequences.** One more thing to install for local development, and the seed script has to
run against a server instead of writing a file. In return, search finds "warfrin", and the
same database works locally and in the deployment. The data is a few tens of MB, well inside
the free tiers.

## 12. Map the remaining DDInter drugs by exact name

*Superseded by 13 the same day. Name matching is now only the last fallback.*

**Context.** The K-Paths dataset gives exact DrugBank IDs for 1,543 of the 1,939 drugs in
DDInter's download files. The other 396 include common drugs such as lamivudine, glyburide and
ondansetron, and their 62,015 rows were being thrown away.

**Decision.** `ml/pipelines/map_ddinter_ids.py` matches the remaining drugs by exact normalized
name against names that come with a DrugBank ID in K-Paths and in the Ayvaz merged set. Names
with a qualifier in brackets, like "Calcitriol (topical)", are formulations and are not
matched. Neither is any name that points at more than one DrugBank ID. The Ayvaz KEGG rows are
left out of the name list because their names lost the first letter in the original merge
("yridoxal_Phosphate"). Each row of the map records whether it came from K-Paths or a name.

We checked the method where we know the answer: matching the K-Paths drugs using only Ayvaz
names gives the same DrugBank ID for 982 of 989 (99.3%). The seven misses are all salt or form
variants with their own DrugBank entry, such as atracurium and its besylate.

**Consequences.** 136 more DDInter drugs are mapped and 260 stay unmapped (mostly the bracketed
formulations and biologics). DDInter's severity coverage of TDC pairs goes from 13.9% to 17.1%,
and all sources together from 25.8% to 28.1%. Going by the check above, roughly 1 in 140
name-matched drugs may be a sibling salt form rather than the exact drug.

## 13. Full DDInter data, mapped by DDInter's own DrugBank links

**Context.** DDInter's bulk download covers 8 of its 14 ATC groups, and its authors hadn't
answered our request for the rest. The OpenMRS DDI knowledge base
(`pbiondich/openmrs-ddi-knowledge-base` on GitHub, by an OpenMRS co-founder) publishes DDInter
2.0's full interaction table, 295,184 pairs over 2,283 drugs, collected by walking DDInter's
interaction groups. It also records the DrugBank ID each DDInter drug page links to. Its
attribution file says it reformats DDInter's data and adds no interaction claims; the packaging
is MPL 2.0 and the facts stay under DDInter's own terms (CC BY-NC-SA, scholarly use allowed).

**Decision.** Use its `src/interactions.jsonl` and `src/drugs.jsonl`, pinned to commit
`7e2bd2c2`, as our DDInter source. We use only DDInter's pairwise ratings. The repo's "derived"
tier, chains inferred through drug-disease rows, is not used, because it is an inference and
not a DDInter rating. The DrugBank links become the first mapping method, K-Paths the second
and name matching the last (`ml/pipelines/map_ddinter_ids.py`).

Before using it we checked it against what we already had:
- Every one of the 160,235 pairs in DDInter's official CSVs is in it, with the same level
  (100%).
- Its DrugBank links agree with K-Paths for 1,513 of 1,514 drugs. Where they differed from our
  name match, DDInter's own drug page sided with the links (fluticasone, DDInter766, is
  DB13867 on the page, not DB00588).
- Spot checks on well-known pairs that the CSVs didn't have came out as expected:
  simvastatin + clarithromycin and sildenafil + nitroglycerin are major, sertraline +
  fluoxetine moderate.

**Consequences.** 2,108 of 2,283 DDInter drugs map to DrugBank (2,077 by DDInter's links, 29
by K-Paths, 2 by name). DDInter grades 66,324 TDC pairs, and with the Ayvaz set the severity
coverage of TDC pairs is 40.3% (77,144 pairs), up from 28.1%. We depend on a third party's
collection of DDInter rather than DDInter's own download, so the commit is pinned and the
files are checksummed, and the CSV comparison above can be rerun at any time. The
data is cited as DDInter 2.0 (Tian et al., NAR 2025), with the OpenMRS repository credited for
the packaging.

## 14. Build 3D models offline, not per request

**Context.** The results page shows each drug's structure in 2D and 3D. Turning a SMILES into
3D coordinates (RDKit ETKDG + MMFF) was first done inside the API request, with molecules over
60 heavy atoms skipped. Timing it on all 1,706 drugs showed size isn't what makes it slow:
Quinine (24 heavy atoms) took 62.8 s and Dolasetron 36.2 s, because their SMILES carry
stereo tags on bridgehead atoms that ETKDG can't satisfy, so it keeps retrying. RDKit 2023.09
has no timeout for a single embedding.

**Decision.** `ml/pipelines/conformers.py` builds every 3D model once, offline, and `seed.py`
loads them into two new `drugs` columns, `molblock` and `conformer_note`. The pipeline caps
attempts at 20 (`maxIterations`); if the stereo-enforced attempt fails it retries without
enforcing stereochemistry and says so in `conformer_note`, which the page shows under the
model. Molecules over 60 heavy atoms get 2D only. The 2D drawing stays per request (RDKit draws
it in milliseconds).

Alternatives considered: per-request embedding with a size cap (above: no upper bound on time);
PubChem's 3D SDF files (a network call to a third party on every view, and PubChem has no 3D
record for large or flexible molecules); RDKit.js in the browser (a ~7 MB WebAssembly download
with the same slow molecules).

**Consequences.** Every structure request is a database read plus a 2D drawing. The pipeline
must run before `seed`. Models with relaxed stereochemistry can have a chiral centre the wrong
way round; the note says so and points to the 2D drawing, which is drawn from the SMILES as given.

## 15. 3Dmol.js for molecules, plain SVG for the interaction map

**Context.** The redesign adds a rotating 3D molecule and a diagram of how the chosen drugs
interact.

**Decision.** 3Dmol.js (`3dmol@2.5.5`), imported with `import()` so it downloads only when a
3D model is first shown (its own 170 kB gzipped chunk). The interaction map is a hand-written
SVG: at most 10 nodes on a circle, one line per pair coloured by its worst severity, dashed
when no source has the pair.

Alternatives considered: three.js / react-three-fiber (general 3D engines; we would have to
write atom and bond drawing ourselves), Mol* and NGL (built for proteins, much larger), and
Cytoscape or D3 for the map (layout engines for large graphs; 10 nodes don't need one).

**Consequences.** One new frontend dependency. 3Dmol needs WebGL; without it the page says so
and the 2D drawing still works. The build warns that 3Dmol uses `eval` internally; that is in
the library, not our code.

## 16. Dark "lab" theme, no invented panels

**Context.** The redesign took its look from a ChemiLens concept image (dark, glowing, molecule
in the hero) and DrugBank's interaction card (label column on the left, value on the right).

**Decision.** Our own palette (night-blue background, sky-blue accent, violet glow, severity in
red / amber / green / grey) set as tokens in `styles.css`; no DrugBank or ChemiLens branding.
Only panels backed by our data are shown. The concept image's absorption score, toxicity,
binding affinity and stability graphs are left out because we have no such data, and
DrugBank's "management" and "evidence level" fields are licensed DrugBank content we don't
have.

**Consequences.** Print switches the tokens back to dark-on-white so the PDF report stays
readable. Animations (card fade-in, map lines drawing in, molecule spin) stop when the OS asks
for reduced motion.

## 17. Accounts with a saved history, sign-in required

**Context.** The scope said "no login, no accounts, no history", so the app held no patient data.
On 2026-10-30 the project owner chose accounts, a saved history of checks, and a checker that
needs sign-in.

**Decision.** Store only what the feature needs: email, password hash, sessions, and per check
the drug IDs and a timestamp (`users`, `user_sessions`, `saved_checks`). Registration needs an
explicit tick that checks are saved (`accept_history: true`, enforced by the API, not only the
form). Every history query filters on the signed-in user's ID, so a check ID from someone else
returns 404. Users can delete a check or their account; the foreign keys cascade, so sessions and
checks go with the account. Sign-in is enforced by the API (`current_user` dependency), not just
hidden in the UI. Drug structures stay public because the landing page shows one and they are not
personal.

Alternatives considered: accounts without history (no health data held, but the owner wanted the
history), and keeping the app account-free.

**Consequences.** A saved medicine list is health data. Under India's DPDP Act 2023 that means a
stated purpose, consent, and deletion on request; the consent box and the delete buttons cover
those for a student project, but a real deployment needs a privacy notice reviewed by someone
qualified. `seed.py` no longer drops every table: it rebuilds only `drugs` and
`known_interactions`, so reseeding can't wipe accounts. `saved_checks.drug_ids` has no foreign
key to `drugs` for the same reason; if a rebuild ever renumbered drugs, old history would point at
the wrong names. There is no email verification or password reset yet, and the register endpoint
says when an email is already taken (account enumeration), which verification by email would fix.

## 18. Server-side sessions in an httpOnly cookie, passwords hashed with scrypt

**Decision.** Login creates a random 32-byte token (`secrets.token_urlsafe`), stores its SHA-256
in `user_sessions` and sends the token in a cookie that is `HttpOnly`, `SameSite=Lax` and, once
`HTTPS=true`, `Secure`. Sign-out deletes the row. Passwords use `hashlib.scrypt` from the standard
library at OWASP's minimum (N=2^17, r=8, p=1, 128 MiB) with a 16-byte random salt; the stored
string carries its parameters so they can be raised later. Unknown emails are checked against a
dummy hash so they take as long as a wrong password, and both get the same message.

Alternatives considered: a JWT in `localStorage` (readable by any injected script, and can't be
revoked before it expires); Argon2id via `argon2-cffi` (OWASP's first choice, but a new
dependency where the standard library's scrypt is also on OWASP's list).

**Consequences.** The browser's JavaScript can't read the session (checked: `document.cookie` is
empty). Each login or register costs 1.2 s of CPU (measured on the dev laptop, 2026-10-30) and
128 MiB of memory for the hash, which is the point: it makes guessing slow. It is also a risk:
FastAPI runs these in a thread pool of up to 40 threads, so 40 logins at the same moment could
need about 5 GB. The per-IP limit only partly covers this; a public deployment should cap
concurrent logins or lower the cost to another OWASP-listed setting.

## 19. In-memory sliding-window rate limits

**Decision.** `core/rate_limit.py`: per client IP, at most 5 register/login requests a minute,
60 searches, 30 checks, 60 structure requests. Over the limit the API answers 429 with
`Retry-After` in the usual error shape.

Alternatives considered: `slowapi` (a dependency for about 25 lines), limits in Nginx or
Cloudflare (the right place in production, but there is no deployment yet).

**Consequences.** Counts live in one process's memory (`shortcut:` comment in the file): several
workers each count separately, and a restart resets them. Behind a proxy every request comes
from the proxy's IP unless uvicorn runs with `--proxy-headers` from a trusted proxy. The limit is
per IP, not per account, so many IPs could still try one account slowly.

## 20. Security headers, origin check, CSP in the build

**Decision.** `core/security.py` adds `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy` and a deny-all CSP to API
responses (not `/docs`, which loads Swagger UI from a CDN), `Cache-Control: no-store` on account
and history responses, and HSTS when `HTTPS=true`. POST and DELETE requests whose `Origin` is
neither in `CORS_ORIGINS` nor the request's own host get 403 (CSRF defence on top of SameSite),
and bodies over 64 KB get 413. CORS allows only GET, POST, DELETE and `Content-Type`. The built
frontend gets a CSP `<meta>` tag (scripts only from our own origin, fonts from Google, images from
`data:`); the dev server is left without one because its hot reload needs inline scripts. The
Vite proxy now keeps the browser's `Host` header (`changeOrigin: false`) so the origin check can
compare them.

**Consequences.** 3Dmol still works under `script-src 'self'` (no CSP errors in the browser
test, although the library contains `eval`). HTTPS itself comes from the host or reverse proxy,
not from this code; `HTTPS=true` must be set there. `frame-ancestors` can't be set from a meta
tag, so the web server serving the frontend must send it.

## 21. A public quick check on the landing page

**Context.** Decision 17 put the whole checker behind sign-in. On 2026-10-30 the project owner
chose that visitors can try a check on the landing page without an account, and that
everything else (the full checker page, results page, history, drug pages, research) needs one.

**Decision.** `GET /drugs/search`, `POST /interactions/known`, `GET /drugs/{id}/structure` and
`GET /stats` work without a session. `/interactions/known` uses `optional_user`: a signed-in
check is saved to history, an anonymous one is not (tested). The drug list, drug pages, history
and account endpoints still return 401 without a session. Results from the landing page stay on
the landing page and say they weren't saved.

**Consequences.** Anyone can now use the checking endpoints, so the per-IP rate limits (decision
19) are the only brake on scraping them. Safety information is no longer behind a form.

## 22. Drug pages, identifier mapping and live stats

**Decision.** `ml/pipelines/identifiers.py` writes `identifiers.parquet`: DDInter ids (from
`ddinter_to_drugbank_map.csv`, 1,241 drugs), KEGG DRUG ids (KEGG's PubChem SIDs turned into CIDs
with the cached `sid_cid.json`, 1,423 drugs) and InChI / InChIKey from RDKit (1,701 drugs). Ids
are lists because 97 drugs have several DDInter entries and 2 have two KEGG ids. `seed.py` loads
them into four new `drugs` columns. `services/catalog.py` serves the paged drug list (24 a page,
with RDKit thumbnails cached in memory), drug detail (every documented partner with its worst
severity) and `/stats`, which the landing page counts up from instead of hard-coded numbers.
Warfarin's computed InChIKey matches the one on DrugBank's warfarin page.

Not mapped: ATC, CAS, UNII, ChEMBL and MeSH; no source we use provides them. DDInter ids are shown
without a link because DDInter's site didn't respond when the URL format was checked.

**Consequences.** Phenobarbital, the most connected drug, returns 913 partners (178 KB); GZip
middleware now compresses responses over 1 KB. `/stats` is cached for the life of the process, so
the API must be restarted after a reseed.

## 23. Visual system: dark green theme, DrugBank-style structure, Motion for animation

**Context.** The owner asked for the look of their mockup (dark green, glowing, 3D) with
DrugBank's structure. DrugBank's live site was studied in a headless browser: navy `#161F44` and
magenta `#D00993`, Gemeli at weight 400, mega-menus, title bands over white cards, table pages
with structure thumbnails.

**Decision.** Our own palette and name: dark green-black with a mint accent, alternating with
light "sand" bands, plus a light theme (toggle in the header, remembered in `localStorage`).
Plus Jakarta Sans and JetBrains Mono from Google Fonts. DrugBank's patterns, not its brand: the
three-column mega-menu, page bands, the drug-page fact rows and identifier block, the drug table.
The owner's app icon opens the site in an intro and flies into the header (Motion `layoutId`),
once per browser session. Animation uses **Motion** (`motion@14.2.0`, the newest release older
than two weeks): springs, scroll-linked transforms, shared-layout transitions and `whileInView`
reveals, all switched off by `MotionConfig reducedMotion="user"` when the OS asks. 3D is CSS
(perspective, `preserve-3d`, pointer parallax) plus 3Dmol; no three.js.

The mockup's invented testimonials, stock photos, unused sources (openFDA, CRESCENDDI) and the
"Minor: generally safe" label were left out.

**Consequences.** The main JS bundle grew from 56 kB to about 129 kB gzipped, mostly Motion. The
decorative molecules ignore the mouse (`nomouse`) because 3Dmol's wheel zoom swallowed page
scrolling. The 2D structures are now drawn dark-on-transparent and inverted in CSS for dark
backgrounds.

## 24. Drug explanations from MeSH, not generated by AI

**Context.** Search results and drug pages said nothing about what a drug is. Our sources have no
plain-language text: PubChem's descriptions are now almost all ChEBI chemistry (56 of a 100-drug
sample, none saying what the drug treats), DrugBank's text is licensed, and openFDA allows 1,000
requests a day without a key.

**Decision.** `ml/pipelines/descriptions.py` takes each drug's MeSH definition from the U.S.
National Library of Medicine's SPARQL endpoint (descriptor scope note, or a supplementary chemical
record's note), matched by our name, then PubChem's title (so "Acetylsalicylic acid" finds
"Aspirin"), then synonyms; answers are cached in `data/raw/mesh_cache.json`. Search results show the
first sentence; drug pages show the full text with the MeSH id linked. 1,509 of 1,706 drugs have one.
Generating explanations with an AI model was considered and left for later: it would need to be
limited to rewording the MeSH text and labelled, because a model can state facts no source gives.

**Consequences.** 197 drugs show "no plain-language description from MeSH". Typo-tolerant search can
surface a drug through a brand name (Cefotiam appears for "aspirin" via its brand "Aspil"), so search
results now also return `matched`, the synonym that found the drug when its own name didn't, and the
dropdown shows it ("Cefotiam · matched “Aspil”") next to the explanation.
