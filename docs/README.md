# PharmGraph AI

A drug–drug interaction checker. Pick 2–10 medicines and it shows two separate lists: the
interactions documented in drug databases, with severity where a source gives one, and the
interactions a graph neural network predicts but nobody has confirmed.

Decision-support prototype for a GLA University project (Neural Cyphers T-100). It doesn't
prescribe and stores no patient data.

## Folders

```
PharmaGraph-AI/
├── backend/            FastAPI app
│   ├── app/
│   │   ├── api/routes/     endpoints (drugs, interactions)
│   │   ├── core/           config, database, errors, request logging
│   │   ├── models/         database tables and request/response shapes
│   │   ├── services/       search, interaction lookup, severity rules
│   │   ├── main.py
│   │   └── seed.py         loads the pipeline tables into PostgreSQL
│   ├── tests/
│   └── requirements.txt
├── frontend/           React + Vite
│   └── src/
│       ├── components/     Header, Hero, SearchPanel, ResultsPanel, SafetyPanel
│       ├── data/           sample data until the UI calls the API
│       └── App.jsx
├── ml/
│   ├── pipelines/      data pipeline, run in the order below
│   └── requirements.txt
├── data/               README and checksums are committed; raw/ and processed/ are not
└── docs/               scope, data dictionary, decisions, architecture, progress, testing
```

## Setup

Python 3.10, Node 20+ and PostgreSQL 17.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt -r ml/requirements.txt
cd frontend; npm install; cd ..
```

Database: one user and one database, both `pharmgraph`.

```powershell
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
& $psql -U postgres -h localhost -c "CREATE ROLE pharmgraph LOGIN PASSWORD '<password>';"
& $psql -U postgres -h localhost -c "CREATE DATABASE pharmgraph OWNER pharmgraph;"
```

Then create `.env` in the repo root (Git ignores it) with:

```
DATABASE_URL=postgresql+psycopg://pharmgraph:<password>@localhost:5432/pharmgraph
```

## Data pipeline

The raw files go in `data/raw/`; `data/checksums.txt` lists every file and its source, and
`docs/decisions.md` says why each source is used. From the repo root:

```powershell
.venv\Scripts\python.exe -m ml.pipelines.map_ddinter_ids
.venv\Scripts\python.exe -m ml.pipelines.load_ayvaz
.venv\Scripts\python.exe -m ml.pipelines.load_kegg
.venv\Scripts\python.exe -m ml.pipelines.merge_severity
.venv\Scripts\python.exe -m ml.pipelines.fetch_pubchem_names
.venv\Scripts\python.exe -m ml.pipelines.build_tables
.venv\Scripts\python.exe -m ml.pipelines.quality_report
```

`load_kegg` and `fetch_pubchem_names` call public APIs and take a while the first time; both
cache what they fetch and pick up where they stopped.

## Run

```powershell
cd backend
..\.venv\Scripts\python.exe -m app.seed
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

API docs at http://127.0.0.1:8000/docs. In another terminal:

```powershell
cd frontend
npm run dev
```

The app runs at http://localhost:5173.

## Tests

```powershell
.venv\Scripts\python.exe -m pip install pytest
cd backend
..\.venv\Scripts\python.exe -m pytest
```
