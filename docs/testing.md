# Testing

Checks that have actually been run, with the command, the date and the real result. Anything
not listed here hasn't been tested.

Commands run from the repo root with the project venv (`.venv\Scripts\python.exe`).

## Data pipeline

| Date | What was checked | How | Result |
|---|---|---|---|
| 2026-10-11 | Full DDInter copy matches DDInter's official CSVs | compared all pairs present in both | 160,235 of 160,235 pairs have the same level |
| 2026-10-11 | DDInter → DrugBank fallbacks are accurate | `python -m ml.pipelines.map_ddinter_ids` compares them with DDInter's own links | K-Paths 1,513 / 1,514; name match 1,138 / 1,150 (99.0%) |
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

`build_tables.py` runs its own checks every time (see `check()`): unique `drug_id`, one
`drug_id` per DrugBank ID, unique `(pair_key, interaction_type)`, sorted pair, both drugs exist,
no `#Drug` placeholder left, severity in the enum. The build stops if any fails.

## Not yet tested

- API: no endpoints have logic yet (commits 14–18).
- Database load: PostgreSQL not set up yet (commit 11).
- Model: no fingerprints, graph or baseline yet (commits 19–22).
- Frontend: runs on sample data only; never tested against the API.
