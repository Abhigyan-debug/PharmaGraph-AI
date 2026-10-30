# Glossary

Terms used in this project, in plain words.

| Term | Meaning |
|---|---|
| DDI | Drug–drug interaction: one medicine changing what another one does |
| Documented interaction | An interaction recorded in a source (TDC, DDInter, KEGG...). Shown in the "documented" list |
| Potential interaction | A pair the model scores as likely to interact, which no source records. Shown separately, never mixed with documented ones |
| Severity | How serious an interaction is: major, moderate, minor, or unknown when no source says |
| `severity_raw` | Every source's own label for a pair, kept exactly as written, e.g. `DDInter: Major; FrenchDB: PC` |
| Most-severe-wins | When sources disagree on a pair, we show the most serious of their levels |
| DrugBank ID | DrugBank's identifier for a drug, e.g. `DB00682` (warfarin). TDC uses these |
| `drug_id` | Our own identifier, `pg_` + 6 digits. Every table joins on it |
| `pair_key` | Two `drug_id`s sorted and joined with `__`, so (A, B) and (B, A) give the same key |
| Interaction type | TDC's category for an interaction, 1–86. Each has one sentence template like "#Drug1 may increase the anticoagulant activities of #Drug2" |
| SMILES | A one-line text spelling of a molecule's structure, e.g. `CC(=O)Oc1ccccc1C(=O)O` for aspirin |
| RDKit | Python chemistry library. We use it to read SMILES and make fingerprints |
| Morgan fingerprint | A fixed-length list of 0s and 1s (2048 here) marking which small chemical patterns a molecule has. It's what the model sees for each drug |
| InChIKey | A fixed-length code computed from a structure. Its first block depends only on how atoms connect, which is how we match KEGG drugs to ours |
| Salt form | The same active drug packaged with a counter-ion, e.g. warfarin sodium. We match KEGG's salt forms to the parent drug |
| PubChem CID | PubChem's identifier for a compound |
| ATC | Anatomical Therapeutic Chemical classification. DDInter splits its download by ATC letter (C = cardiovascular, N = nervous system...) |
| CI / P | KEGG's two labels: contraindicated, and precaution |
| ANSM | The French medicines agency; its interaction thesaurus is one of our severity sources |
| Parquet | A compressed table file format that pandas reads and writes quickly |
| Checksum (SHA-256) | A fingerprint of a file's bytes. If two people's checksums match, they have the identical file |
| Rate limit / HTTP 429 | A server refusing requests because too many came too fast, with `Retry-After` saying when to try again. PubChem did this to us once; our API now does it too, per IP (decision 19) |
| GCN | Graph Convolutional Network: a model that learns from a drug's own features and its neighbours in the interaction graph |
| AUPR | Area under the precision–recall curve. Our main score, because real interactions are rare among all possible pairs |
| Edge split | Dividing the known interactions into train / validation / test sets, so the model is tested on pairs it never saw |
| AUROC | Area under the ROC curve: the chance the model scores a random real pair above a random non-pair. 0.5 is guessing |
| F1 at 0.5 | Precision and recall combined into one number, counting a pair as predicted when its score is at least 0.5 |
| Negative sample | A drug pair with no known interaction, used as a "no" example. Not proof the pair is safe, only that no source records it |
| Edge split | Dividing the known pairs into train, validation and test sets, so the model is scored on pairs it never saw |
| Data leakage | Test information reaching training, which makes scores look better than they are. Our split checks no pair is in two parts |
| Logistic regression | A simple linear model that turns a weighted sum of features into a probability. Our baseline the GCN has to beat |
| PyG | PyTorch Geometric, the library for graph neural networks we build the graph with |
| `edge_index` | PyG's edge list: a 2 × E tensor of row indices. Undirected graphs store each pair twice, once each way |
| Seed | The starting number for a random generator. Same seed, same split, so results can be reproduced |
| Debounce | Waiting until typing pauses (250 ms here) before calling the search API, instead of calling on every key |
| Hash route | A page address after `#`, like `#/results`. The browser doesn't reload, and the server needs no route setup |
| Proxy (Vite) | The dev server forwarding `/api/...` requests to the backend on port 8000, so the browser sees one origin |
| TestClient | FastAPI's way to call the app's endpoints from a test without starting a server |
| SMILES | A molecule written as one line of text, e.g. `CC(=O)O` is acetic acid. Letters are atoms, `=` is a double bond, brackets are branches. Every drug in `drugs` has one |
| RDKit | Open-source chemistry library. We use it for fingerprints, the 2D drawings and the 3D models |
| Heavy atom | Any atom that isn't hydrogen. Used as a size measure: warfarin has 23, bivalirudin 150+ |
| Conformer | One 3D shape a molecule can take. A molecule has many; we compute one low-energy one, not an experimental structure |
| ETKDG | RDKit's method for turning a SMILES into 3D coordinates (distance geometry plus known torsion-angle preferences) |
| MMFF | A force field: rules for bond lengths and angles. `MMFFOptimizeMolecule` nudges the ETKDG coordinates into a lower-energy shape |
| MolBlock | A text format that lists every atom's x, y, z and every bond. The 3D viewer reads it (`V2000` in it marks the format version) |
| Stereochemistry | Which way atoms point in space at a chiral centre (`@` / `@@` in SMILES). Mirror images can act differently as drugs |
| 3Dmol.js | Browser library that draws molecules in 3D with WebGL; used for the rotating ball-and-stick models |
| WebGL | The browser's API for GPU-drawn 3D graphics. If it is turned off, the app says so and the 2D drawing still works |
| Jmol colours | A standard atom colour scheme: carbon grey, hydrogen white, oxygen red, nitrogen blue, sulfur yellow |
| Lazy loading | Downloading code only when it is first needed. The 3D library loads on the first 3D view, not with the page |
| Design token | A named colour or size (`--major`, `--paper`) in `styles.css`. Changing the token changes it everywhere |
| `prefers-reduced-motion` | An OS setting for people who get dizzy or distracted by animation. With it on, the app stops the spin and the fade-ins |
| Authentication | Proving who you are (email + password). Authorization is what you may then do: here, only see your own checks |
| Session | The server's record that you signed in. Ours is a row in `user_sessions` plus a random token in a cookie |
| Cookie (`HttpOnly`, `Secure`, `SameSite`) | A small value the browser sends back on every request. `HttpOnly`: page scripts can't read it. `Secure`: HTTPS only. `SameSite=Lax`: not sent on other sites' form posts |
| Password hash / salt | A one-way scramble of the password; we store that, never the password. The salt is random bytes mixed in so two equal passwords hash differently |
| scrypt | A deliberately slow, memory-hungry hash for passwords, in Python's `hashlib`. Slow on purpose so guessing is slow |
| Account enumeration | Finding out which emails have accounts from how the site answers. Login gives the same answer for "no such email" and "wrong password" |
| XSS | Cross-site scripting: an attacker's script running inside our page. CSP and `HttpOnly` cookies limit the damage |
| CSRF | Cross-site request forgery: another site making your browser send a request to ours with your cookie. Blocked by `SameSite` and the origin check |
| CSP | Content-Security-Policy: a list of where a page may load scripts, styles, fonts and images from. Anything else is blocked |
| HSTS | A header telling browsers to use HTTPS only for this site from now on |
| CORS | Rules for which other websites' pages may call our API from the browser |
| IDOR | Insecure direct object reference: reading someone else's data by changing an ID in the URL. Prevented by filtering on the signed-in user |
| IntersectionObserver | A browser API that says when an element scrolls into view; drives the landing page's reveal animation |
| `perspective` / `rotateX` | CSS 3D: `perspective` sets how far the viewer is, `rotateX/Y` tilts an element in 3D. Used for the tilt cards |
| InChI / InChIKey | IUPAC's standard text identifier for a structure, and its fixed-length 27-character hash. The same molecule gets the same key in every database, which is why it is useful for mapping |
| KEGG DRUG id | KEGG's id for a drug, `D` + 5 digits (warfarin is `D08682`) |
| PubChem SID vs CID | A SID is one depositor's record of a substance; a CID is PubChem's merged compound. Many SIDs point to one CID |
| Identifier mapping | Lining up one drug's ids across databases (DrugBank, PubChem, KEGG, DDInter) so their data can be joined |
| Ego network | A graph of one node and its direct neighbours; the drug page draws one drug and a sample of its interaction partners |
| Mega-menu | A large dropdown with several columns of links and descriptions, as on DrugBank's header |
| Command palette | A search box opened with a keyboard shortcut (Ctrl/⌘ K) that jumps straight to a page |
| Motion (`motion/react`) | The animation library used here: springs, scroll-linked values, shared-layout transitions |
| `layoutId` | Motion's shared-layout feature: two elements with the same id are treated as one, so Motion animates the move from one to the other (the intro logo flying into the header) |
| Spring animation | Motion that behaves like a spring (stiffness, damping) instead of a fixed duration, so it settles naturally |
| Parallax | Layers moving different distances as the pointer or page moves, which reads as depth |
| `preserve-3d` | CSS that keeps children in the parent's 3D space instead of flattening them, needed for the tilted hero and phone |
| Gzip | Compressing a response before sending it; the browser unpacks it. Turned on for API responses over 1 KB |
| MeSH | Medical Subject Headings: the U.S. National Library of Medicine's vocabulary. Each drug heading has a short definition (scope note); we show it as the drug's explanation, with a link to its record |
| SPARQL | A query language for linked data; used to ask MeSH for many drug definitions in one request |
