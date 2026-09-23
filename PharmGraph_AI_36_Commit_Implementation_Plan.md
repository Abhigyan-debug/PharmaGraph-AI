# PharmGraph AI — 36-Commit Implementation Plan

**Team:** Neural Cyphers T-100 | GLA University Mathura  
**Title:** AI-Powered Drug–Drug Interaction (DDI) Checker Using Graph Neural Networks  
**Plan type:** Build guide aligned to **36 commits** (12 per member: Abhigyan, Oshiva, Bhavishya)

---

## 1. Synopsis (project scope)

PharmGraph AI is a **web-based decision-support prototype** (not a clinical prescription system). A user searches medicines, selects a set, and receives:

1. **Documented (known) DDIs** — from curated/database sources with severity when the source supports it.  
2. **Potential DDIs** — from a **GNN link-prediction** model, clearly labeled as *for review*, with confidence and limitations.

**In scope (v1):** drug search, known DDI lookup, GNN-based potential interaction scoring, severity/confidence display, simple explanations, demo-ready UI.

**Out of scope (v1):** prescribing, replacing clinician judgment, food–drug interactions, drug–disease, genomics, mobile apps, hospital/EHR integration.

**Delivery principles:**

- Never mix known and predicted interactions in one undifferentiated list.  
- Show severity only when backed by source data or validated model mapping.  
- Version datasets, models, and API contracts for reproducibility.

**Core user flow (Week 8 / final demo):**

`Search drugs → Select medicines → Check documented DDIs → Run GNN analysis (when applicable) → View severity and/or probability → Read explanation`

---

## 2. Recommended stack and repository layout

| Layer | Choice | Why |
|--------|--------|-----|
| Frontend | **React** (Vite) + TypeScript | Fast dev, component reuse for search/dashboard |
| Backend | **FastAPI** (Python 3.10+) | Async APIs, OpenAPI docs, easy ML serving |
| Database | **SQLite** (dev) or **PostgreSQL** (optional) | Drugs + known interactions lookup |
| ML | **PyTorch** + **PyTorch Geometric (PyG)** | Standard GNN training |
| Chemistry features | **RDKit** | Molecular descriptors / fingerprints for node features |
| Graph / data | **pandas**, **NetworkX** (optional viz) | ETL and QA |

**Suggested monorepo layout:**

```text
pharmgraph-ai/
├── README.md
├── .env.example
├── docs/
│   ├── scope.md
│   ├── data-dictionary.md
│   └── reproducibility.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── models/          # SQLAlchemy / Pydantic
│   │   ├── services/
│   │   └── core/            # config, logging
│   └── tests/
├── ml/
│   ├── data/                # raw + processed (gitignore large files)
│   ├── pipelines/
│   ├── graph/
│   ├── models/
│   └── experiments/
├── frontend/
│   └── src/
└── data/
    └── README.md            # source URLs, licenses, versions
```

---

## 3. One-time environment setup (Windows)

Do this before **Commit 3–6**.

### 3.1 Tools

- **Git**, **Node.js 20 LTS**, **Python 3.10 or 3.11**  
- **VS Code** or Cursor with Python + ESLint extensions  

### 3.2 Python (backend + ML)

```powershell
cd E:\Pharmagraph-AI
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install fastapi uvicorn[standard] sqlalchemy pydantic-settings python-dotenv
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install torch-geometric pandas numpy scikit-learn rdkit networkx pytest httpx
```

> Use CUDA wheels from [pytorch.org](https://pytorch.org/) if you have a GPU; CPU is fine for a mini-project subset.

### 3.3 Frontend

```powershell
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install axios react-router-dom
```

### 3.4 Run locally (after scaffold commits)

```powershell
# Terminal 1 — API
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 2 — UI
cd frontend
npm run dev
```

---

## 4. Datasets — where to get data and how to use it legally

Use **multiple sources**; document license and version in `docs/reproducibility.md`.

### 4.1 Primary sources (from project synopsis)

| Source | What you get | Access | Use in PharmGraph |
|--------|----------------|--------|-------------------|
| **DrugBank** | Drug names, IDs, some interaction data | [go.drugbank.com](https://go.drugbank.com/) — academic license / registration | Known DDI lookup, drug metadata, SMILES for RDKit |
| **openFDA** | Drug labels, adverse event references | [open.fda.gov](https://open.fda.gov/) — public API | Supplementary names, label text for explanations (not primary GNN labels) |
| **TWOSIDES** | Drug pairs linked to side-effect co-occurrence (off-label DDI signal) | Published with Tatonetti et al.; often via [Side Effect Resource](https://tatonettilab.org/) / supplementary tables | Extra edges or weak labels; **do not** treat as confirmed clinical DDI without disclaimer |
| **PubChem** | Compound IDs, SMILES | [pubchem.ncbi.nlm.nih.gov](https://pubchem.ncbi.nlm.nih.gov/) | Resolve identifiers when DrugBank ID missing |
| **ChEMBL** (optional) | Bioactivity, targets | [ebi.ac.uk/chembl](https://www.ebi.ac.uk/chembl/) | Optional node features or heterogeneous graph later |

### 4.2 Identifier normalization (critical)

Map every record to a **canonical internal `drug_id`** plus optional:

- DrugBank ID  
- PubChem CID  
- Normalized name (lowercase, strip salts if policy agreed)

**Research keywords:** `drug name normalization RxNorm`, `DrugBank ID mapping`, `PubChem synonym matching`

### 4.3 Graph construction strategy (v1)

- **Nodes:** drugs in your supported formulary (start with 500–2000 drugs if data is heavy).  
- **Edges (known):** documented DDI pairs from approved export.  
- **Edge labels (optional):** severity bucket if source provides it.  
- **Node features:** RDKit Morgan fingerprint (2048-bit) or MACCS + molecular descriptors averaged to fixed length; concatenate with learned embedding in GNN.  
- **Link prediction task:** predict held-out edges (positive DDI pairs) vs sampled non-interacting pairs (negative sampling).

### 4.4 Data quality checks (Commits 8–9)

- Duplicate pairs `(A,B)` vs `(B,A)` — store undirected canonical key.  
- Missing SMILES — flag `unsupported_for_ml` but still allow known-DDI lookup if interaction exists.  
- Coverage report: `% drugs with SMILES`, `% pairs with severity`, count by severity.

---

## 5. GNN model choice (what to implement)

Your synopsis asks to compare **GCN**, **GraphSAGE**, and **GAT**. For a **36-commit mini project**, use a **tiered approach**:

| Tier | Model | Library | When |
|------|--------|---------|------|
| **Baseline (required)** | Logistic regression on concatenated RDKit vectors of pair | scikit-learn | Commit 22 — must beat random |
| **Primary (recommended)** | **2-layer GCN** + MLP decoder on node embeddings | PyG `GCNConv` | Commit 23 — matches literature baseline |
| **Optional stretch** | **GraphSAGE** (`SAGEConv`) or **GAT** (`GATConv`) | PyG | Same commit if time; pick one |

**Recommended architecture (aligns with reference paper DPDDI):**

1. GCN encoder: `h_v = GCN(X, A)` for all drugs.  
2. Pair representation: `h_{u,v} = [h_u || h_v]` (concatenation).  
3. Decoder: 2–3 layer MLP → sigmoid (binary DDI) or softmax (multi-class interaction type if labels exist).

**Hyperparameters to document (research + reproducibility):**

- Hidden dim: 128 or 256  
- Dropout: 0.2–0.5  
- LR: 1e-3, Adam  
- Negative sampling ratio: 1:1 or 1:4  
- Split: **edge-level** 70/15/15 train/val/test (no leakage across same pair)

**Search terms for your literature review (Phase 1 / Commit 1):**

- `drug drug interaction graph neural network link prediction`  
- `GCN DDI prediction benchmark`  
- `Decagon polypharmacy side effects graph` (classic reference graph work)  
- `PyTorch Geometric link prediction example`

---

## 6. Primary research paper (read and cite)

Use this as your **main methodological reference** (open access, GCN + pair decoder — directly maps to your commits 19–24):

**DPDDI: a deep predictor for drug–drug interactions**  
- **Authors:** Liu et al.  
- **Venue:** *BMC Bioinformatics* (2020)  
- **DOI:** [10.1186/s12859-020-03724-x](https://doi.org/10.1186/s12859-020-03724-x)  
- **Google Scholar:** search `DPDDI deep predictor drug-drug interactions GCN`  

**What to extract for your report:**

- Why DDI graphs suit GCN (topology of known interactions).  
- Three phases: GCN embeddings → pair fusion → DNN classifier.  
- Metrics used (AUC, AUPR, F1) and comparison to baselines.  
- Limitation: performance depends on network density and new drugs cold-start.

**Secondary paper (optional, knowledge-graph angle):**

**KGNN: Knowledge Graph Neural Network for Drug-Drug Interaction Prediction** — IJCAI 2020  
- PDF: [ijcai.org proceedings 2020/0380](https://www.ijcai.org/proceedings/2020/0380.pdf)  
- Use if you extend to drug–target–gene neighbors later (not required for v1).

---

## 7. Evaluation metrics (Commits 22–24)

Record on **held-out test edges** only:

| Metric | Purpose |
|--------|---------|
| **AUROC** | Ranking quality of interaction vs non-interaction |
| **AUPRC** | Important when positives are rare |
| **F1 @ threshold** | Operational point for demo |
| **Precision@K** | Optional for “top K warnings” UI |

**Baseline to beat:** random pairs, simple “common neighbor” heuristic, sklearn on RDKit pair features.

**Model card (Commit 24):** train date, dataset version, #nodes/#edges, metrics, known failure modes (new drug, rare pairs).

---

## 8. API contract (preview for Commits 14–18, 26)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/drugs/search?q=` | Autocomplete supported drugs |
| POST | `/api/v1/interactions/known` | Body: `{ "drug_ids": ["...", "..."] }` → documented DDIs |
| POST | `/api/v1/interactions/predict` | Same body → GNN potentials + confidence |
| GET | `/health` | Liveness |

**Prediction response fields (Commit 25):**

```json
{
  "pair": ["drug_a_id", "drug_b_id"],
  "type": "potential_gnn",
  "probability": 0.82,
  "confidence_band": "medium",
  "explanation": "Model score based on graph structure and molecular features; not a confirmed clinical interaction.",
  "disclaimer": "Decision support only."
}
```

---

## 9. Phase overview (6 phases × 6 commits = 36)

| Phase | Commits | Module | Outcome |
|-------|---------|--------|---------|
| **1** | 1–6 | Project foundation | Repo, config, UI shell, docs |
| **2** | 7–12 | Drug data | Ingestion, QA, DB, search UI |
| **3** | 13–18 | Backend API | Known DDI, validation, tests |
| **4** | 19–24 | Graph & GNN | Features, graph, train, evaluate |
| **5** | 25–30 | Frontend | Dashboard, predictions, explanations |
| **6** | 31–36 | Integration & QA | E2E, safety docs, deliverables |

**Commit rules:** one complete, reviewable unit per commit; conventional messages e.g. `feat(api): add known interaction lookup endpoint`.

---

## Phase 1 — Project foundation (Commits 1–6)

### Commit 1 — Scope and sources (Abhigyan)

**Deliverable:** `docs/scope.md` + `data/README.md`

**Steps:**

1. Copy v1 in/out of scope from Section 1 of this plan.  
2. List approved sources (DrugBank, openFDA, TWOSIDES) with links and license notes.  
3. Define success metrics: demo flow works; test report; model AUPR on test set recorded.

**Research:** Read abstract + methods of **DPDDI (2020)**; note GCN rationale.

**Exit gate:** Team signs off scope in README or `docs/scope.md`.

---

### Commit 2 — Data dictionary (Abhigyan)

**Deliverable:** `docs/data-dictionary.md`

**Define fields:**

- **Drug:** `drug_id`, `name`, `synonyms[]`, `drugbank_id`, `pubchem_cid`, `smiles`, `supported`  
- **Known interaction:** `drug_a_id`, `drug_b_id`, `source`, `severity_raw`, `severity_display`, `description`  
- **Graph edge:** `src`, `dst`, `relation`, `split` (train/val/test)  
- **Prediction:** fields from Section 8  

**Exit gate:** Backend and ML agree on column names.

---

### Commit 3 — Backend structure (Oshiva)

**Deliverable:** `backend/app/` package skeleton

**Steps:**

1. Create `main.py` with FastAPI app and CORS for `http://localhost:5173`.  
2. Folders: `api/routes`, `services`, `models`, `core/config.py`.  
3. Placeholder routes returning `{}`.

**Exit gate:** `uvicorn app.main:app` starts without error.

---

### Commit 4 — Configuration (Oshiva)

**Deliverable:** `.env.example`, `core/config.py` using `pydantic-settings`

**Variables:** `DATABASE_URL`, `MODEL_PATH`, `LOG_LEVEL`, `CORS_ORIGINS`

**Exit gate:** No secrets in git; README explains copying `.env.example` → `.env`.

---

### Commit 5 — Frontend structure (Bhavishya)

**Deliverable:** Vite React app with layout + routes

**Routes:** `/` (home/search), `/results`, `/about/limitations`

**Exit gate:** `npm run dev` shows layout and navigation.

---

### Commit 6 — Project guide (Bhavishya)

**Deliverable:** Root `README.md`

**Include:** clone, venv, install, run API + UI, commit rules, team owners, link to this plan.

**Exit gate:** New teammate can run app skeleton from README alone.

---

## Phase 2 — Drug data module (Commits 7–12)

### Commit 7 — Dataset loader (Abhigyan)

**Deliverable:** `ml/pipelines/load_drugbank.py` (or generic loader)

**Steps:**

1. Download approved DrugBank export (XML/CSV per your license).  
2. Parse drugs and interaction tables into `data/raw/drugs.parquet`, `data/raw/interactions.parquet`.  
3. Script CLI: `python -m ml.pipelines.load_drugbank --input ... --out data/raw`

**Research:** DrugBank XML schema; openFDA drug label JSON if supplementing names.

**Exit gate:** Raw files committed or documented download script (large files in `.gitignore` + checksum file).

---

### Commit 8 — Identifier normalization (Abhigyan)

**Deliverable:** `ml/pipelines/normalize_ids.py`

**Steps:**

1. Canonical pair key: `tuple(sorted([id_a, id_b]))`.  
2. Normalize names (Unicode, trim, lowercase for search index).  
3. Output `data/processed/drugs_normalized.parquet`.

**Exit gate:** No duplicate `drug_id` for same DrugBank ID.

---

### Commit 9 — Data quality checks (Abhigyan)

**Deliverable:** `ml/pipelines/quality_report.py` → `docs/data-quality-report.md`

**Checks:** duplicates, missing SMILES, orphan interactions, severity null rate.

**Exit gate:** Report reviewed; blockers listed with owner.

---

### Commit 10 — Known DDI preparation (Abhigyan)

**Deliverable:** `data/processed/known_ddi.jsonl` or DB seed script

**Steps:** Map severities to display enum: `major | moderate | minor | unknown` only where source maps cleanly.

**Exit gate:** Sample queries for 5 drug pairs match manual DrugBank spot check.

---

### Commit 11 — Database model (Oshiva)

**Deliverable:** SQLAlchemy models + Alembic or init script

**Tables:** `drugs`, `known_interactions`, optional `synonyms`

**Exit gate:** Seed script loads processed data; search by prefix works in SQL.

---

### Commit 12 — Drug search UI (Bhavishya)

**Deliverable:** Search component calling mock then real API

**Steps:** Debounced input, list results, select chip; store selection in React state/context.

**Exit gate:** UI works against stub API returning fixed JSON.

---

## Phase 3 — Backend API module (Commits 13–18)

### Commit 13 — Severity mapping (Abhigyan)

**Deliverable:** `backend/app/services/severity.py` + unit tests

**Document mapping table** from each source label → display severity; unmapped → `unknown` + hide overstated clinical wording.

---

### Commit 14 — Search API (Oshiva)

**GET `/api/v1/drugs/search`**

**Steps:** SQL `LIKE` or trigram on name/synonym; limit 20; return `{ id, name }`.

---

### Commit 15 — Input validation API (Oshiva)

**Validate** POST bodies: min 2 unique drugs, max 10, all IDs exist and `supported=true`.

**Return 422** with clear messages for invalid/unknown drugs.

---

### Commit 16 — Known DDI API (Oshiva)

**POST `/api/v1/interactions/known`**

Return all pairwise documented interactions among selected drugs with severity + source + description.

---

### Commit 17 — Error and logging (Oshiva)

Structured logging (request id, latency); consistent error JSON `{ "error", "detail", "code" }`.

---

### Commit 18 — API test collection (Bhavishya)

**Deliverable:** `backend/tests/test_api.py` + saved pytest output in `docs/test-evidence/`

Cover: happy path, unknown drug, empty selection, pair with no interaction.

---

## Phase 4 — Graph and GNN module (Commits 19–24)

### Commit 19 — RDKit features (Abhigyan)

**Deliverable:** `ml/pipelines/featurize.py`

**Steps:**

1. For each SMILES, compute Morgan fingerprint (radius 2, 2048 bits) → float vector.  
2. Save `data/processed/node_features.npz` + index mapping `drug_id → row`.

**Research:** RDKit `AllChem.GetMorganFingerprintAsBitVect` documentation.

**Exit gate:** Feature matrix shape `[num_drugs, 2048]` documented.

---

### Commit 20 — Graph construction (Abhigyan)

**Deliverable:** `ml/graph/build_graph.py`

**Steps:**

1. Build `edge_index` (2 × E) from known DDIs (undirected → two directed edges or single undirected in PyG).  
2. Save `data/processed/pharmgraph.pt` (PyG `Data` object).

**Exit gate:** Visualize degree distribution (optional NetworkX plot in docs).

---

### Commit 21 — Train/val/test split (Abhigyan)

**Deliverable:** `ml/graph/split_edges.py`

**Edge split only** — do not put test edges in training graph.  
Negative edges: sample random non-edges, balanced count per epoch.

**Research:** `PyTorch Geometric link prediction train_test_split_edges`

---

### Commit 22 — Baseline model (Abhigyan)

**Deliverable:** `ml/models/baseline_sklearn.py` + metrics JSON

Concatenate RDKit features of u and v; train logistic regression; report AUROC/AUPR on test.

---

### Commit 23 — GNN model (Oshiva)

**Deliverable:** `ml/models/gcn_ddi.py` (GCN + MLP)

**Implement:**

- 2× `GCNConv(in_channels=2048, hidden=128)`  
- Decoder MLP on `[z_u || z_v]`  
- Training loop with early stopping on val AUPR  

**Optional:** duplicate module for GraphSAGE or GAT and compare in experiment log.

**Research:** Re-read DPDDI Section 2–3; PyG GCNConv examples.

---

### Commit 24 — Model evaluation (Oshiva)

**Deliverable:** `docs/model-report.md` + `ml/experiments/metrics.json`

Include: curves, confusion at threshold, error analysis (false positives on sparse drugs), **limitations** paragraph for UI.

**Export:** `ml/artifacts/gcn_ddi.pt` and version hash of training data.

---

## Phase 5 — Frontend module (Commits 25–30)

### Commit 25 — Prediction contract (Abhigyan)

**Deliverable:** `docs/api/prediction-contract.md` + Pydantic schemas in backend

Define enums: `result_type = known | potential_gnn`, confidence bands, disclaimer strings.

---

### Commit 26 — Prediction API (Oshiva)

**POST `/api/v1/interactions/predict`**

Load model artifact at startup; for each pair without known DDI (policy: still score all pairs but UI separates), return probability + explanation template.

**Performance:** batch inference for all pairs among selected drugs.

---

### Commit 27 — Search component (Bhavishya)

Polish UX: loading states, empty state, keyboard navigation.

---

### Commit 28 — Selection component (Bhavishya)

Selected medicine list, remove chip, **Check interactions** button triggering both APIs.

---

### Commit 29 — Results dashboard (Bhavishya)

Two sections: **Documented interactions** (table) and **Potential (GNN)** (table with badge). Sort by severity / probability.

---

### Commit 30 — Severity & explanation UI (Bhavishya)

Color tokens for severity; tooltip for confidence; link to limitations page; never show “contraindicated” unless source says so.

---

## Phase 6 — Integration and quality (Commits 31–36)

### Commit 31 — Reproducibility notes (Abhigyan)

**Deliverable:** `docs/reproducibility.md`

Dataset version hashes, commands to rebuild graph, retrain model, seed values.

---

### Commit 32 — Safety limitations (Abhigyan)

**Deliverable:** `docs/safety-and-limitations.md` + in-app footer text

Decision-support only; GNN is not validated for clinical use; list data gaps.

---

### Commit 33 — Model integration (Oshiva)

Wire prediction service into known-DDI flow; handle model missing gracefully (degrade to known-only).

---

### Commit 34 — Integration tests (Oshiva)

Test API + loaded model with small fixture graph; test timeout and error paths.

---

### Commit 35 — End-to-end UI tests (Bhavishya)

Manual test script or Playwright: search → select 3 drugs → results render both sections.

Save screenshots to `docs/demo/`.

---

### Commit 36 — Final deliverables (Bhavishya)

Presentation slides, test report, updated README, demo video script, archive test evidence.

**Definition of done:** All 36 commits; known-DDI flow works; GNN labeled “potential”; no critical open defects.

---

## 10. Weekly alignment (8-week course timeline)

| Week | Plan week | Commits (approx) | Focus |
|------|-----------|------------------|--------|
| W2 | Research | 1–2 | Literature + DPDDI + model criteria |
| W3 | Data strategy | 2, 7–9 | Sources, dictionary, QA |
| W4 | System design | 3–6, 11 | Architecture, scaffold |
| W5 | Data foundation | 7–12 | Load, DB, search UI |
| W6 | Processing | 13–18, 19–21 | APIs + graph |
| W7 | GNN | 22–26 | Train + prediction API |
| W8 | Integration | 27–36 | UI polish, tests, demo |

---

## 11. Risk controls

| Risk | Mitigation |
|------|------------|
| DrugBank license delay | Start with openFDA names + public TWOSIDES subset; swap in DrugBank when approved |
| GNN underperforms | Ship known-DDI checker first; show GNN as experimental with metrics |
| Severity ambiguity | `unknown` + source field; no fake clinical labels |
| Cold-start drugs | Block ML prediction without SMILES; show message in UI |

---

## 12. Suggested commit message map (quick reference)

| # | Owner | Message hint |
|---|--------|----------------|
| 1 | Abhigyan | `docs: add v1 scope and data source policy` |
| 2 | Abhigyan | `docs: add data dictionary for drugs and interactions` |
| 3 | Oshiva | `feat(backend): scaffold FastAPI application layout` |
| 4 | Oshiva | `feat(backend): add environment-based configuration` |
| 5 | Bhavishya | `feat(frontend): add app shell and routes` |
| 6 | Bhavishya | `docs: add README with setup and contribution guide` |
| 7–36 | … | See phase sections above |

---

## 13. References (for bibliography)

1. Liu, Y., et al. (2020). **DPDDI: a deep predictor for drug–drug interactions.** *BMC Bioinformatics*, 21, 419. https://doi.org/10.1186/s12859-020-03724-x  
2. Lin, X., et al. (2020). **KGNN: Knowledge Graph Neural Network for Drug-Drug Interaction Prediction.** *IJCAI*, 380. https://www.ijcai.org/proceedings/2020/0380.pdf  
3. Zitnik, M., Agrawal, M., & Leskovec, J. (2018). **Modeling polypharmacy side effects with graph convolutional networks.** *Bioinformatics* (Decagon — graph baseline culture).  
4. PyTorch Geometric documentation: **Link prediction** — https://pytorch-geometric.readthedocs.io/  
5. RDKit documentation: **Molecular fingerprints** — https://www.rdkit.org/docs/

---

*Source basis: PharmGraph AI project synopsis and DDI GNN presentation (Neural Cyphers T-100), extended with implementation detail for the 36-commit plan in `build_commit_plan_pdf.py`.*
