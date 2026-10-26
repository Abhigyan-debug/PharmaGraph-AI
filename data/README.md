# data/

Where our data comes from. Read this before running any pipeline script.

**Nothing in `raw/` or `processed/` is committed.** DDInter is CC BY-NC-SA, and the KEGG and
Ayvaz data can't be redistributed. What's committed is this file plus `checksums.txt`, so we
can all confirm we're working off the same files. Why each source was picked is in
`docs/decisions.md` (6, 9, 10 and 13).

```
data/
  README.md          <- committed
  checksums.txt      <- committed
  raw/               <- gitignored, you download it yourself
  processed/         <- gitignored, pipelines write here
```

## Sources

| Source | What we take | File in `raw/` | Terms |
|---|---|---|---|
| TDC DDI DrugBank (Harvard Dataverse file 4139573) | the interaction graph: 191,402 pairs over 1,706 drugs, DrugBank IDs, SMILES, 86 interaction types | `tdc_ddi_drugbank.tab` | derived from DrugBank; cite TDC and DrugBank, no bulk export |
| DDInter 2.0, full tables via `pbiondich/openmrs-ddi-knowledge-base` @ `7e2bd2c2` | severity (Major / Moderate / Minor / Unknown) and each DDInter drug's DrugBank link | `openmrs_ddi/interactions.jsonl`, `openmrs_ddi/drugs.jsonl` | CC BY-NC-SA 4.0; cite Tian et al., NAR 2025 |
| DDInter 2.0 bulk download (ATC A, B, D, H, L, P, R, V) | only to check the copy above | `ddinter_downloads_code_*.csv` | CC BY-NC-SA 4.0 |
| OpenMRS DDI KB `out/ddi_knowledge_base.json` | RxNorm brand names, for search | `openmrs_ddi/ddi_knowledge_base.json` | MPL 2.0 packaging |
| Ayvaz et al. 2015 merged set, conservative file (`dbmi-pitt/public-PDDI-analysis`) | severity from FrenchDB, KEGG 2014, NDF-RT, OSCAR, World-Vista, ONC lists | `ayvaz_pddi_conservative.csv.bz2` | no licence file; cite the paper, don't redistribute |
| KEGG DDI (live API) | severity (CI / P), matched to our drugs by structure | cache under `raw/kegg/` | academic use; don't redistribute |
| PubChem PUG REST | CID, readable names and synonyms | `pubchem_drugs.json` | public domain |

The Ayvaz rows that come from CredibleMeds are skipped: they carry salt names on the wrong
drugs.

`load_kegg` and `fetch_pubchem_names` call the live APIs. They cache every answer and resume
where they stopped, so the first run is slow and later runs aren't. Record the SHA-256 of every
new raw file in `checksums.txt`:

```powershell
Get-FileHash data\raw\<file> -Algorithm SHA256
```

## What the pipelines write to `processed/`

| File | Written by | What it is |
|---|---|---|
| `severity_by_pair.parquet` | `merge_severity` | one row per pair with every source's label, most severe wins |
| `drugs.parquet` | `build_tables` | 1,706 drugs, loaded into PostgreSQL |
| `known_interactions.parquet` | `build_tables` | 191,808 rows, keyed by `(pair_key, interaction_type)` |
| `node_features.npz` | `ml.pipelines.featurize` | `X` [1,705 × 2,048] Morgan fingerprints and the aligned `drug_ids` |
| `edge_split.npz` | `ml.graph.split_edges` | train/val/test positive and negative pairs, as row indices into `X` |
| `pharmgraph.pt` | `ml.graph.build_graph` | PyG `Data`: `x`, undirected `edge_index` of every known pair, `drug_ids` |

## Graph and split

Nodes are drugs, edges are documented interactions, undirected. Node features are RDKit Morgan
fingerprints, radius 2, 2,048 bits. DB11630 (temoporfin) is left out because its SMILES
doesn't parse, which drops 10 pairs, so the graph has 1,705 nodes and 191,392 edges.

The split is 70/15/15 at the edge level with seed 42. Negatives are random drug pairs with no
known interaction, 1:1 with the positives in each part, and no pair appears in two parts. Val
and test edges must stay out of the graph the model trains on.

## Known problems with the data

Measured by `ml/pipelines/quality_report.py`, results in `docs/data-quality-report.md`.

- **Severity is partial.** 85,756 of 191,402 pairs (44.80%) have a severity. The rest are
  `unknown` and are never guessed.
- **Sources disagree.** 17,404 pairs get different levels from different sources. We show the
  most severe and keep every label in `severity_raw`.
- **(A, B) and (B, A).** Same interaction; the sorted `pair_key` makes them one row.
- **Two interaction types for one pair.** 406 pairs appear twice in TDC with different types;
  both rows are kept.
- **Salt forms.** KEGG entries are matched by structure, salts included (decision 10).
- **No record is not "no interaction".** A pair missing from TDC may still interact.
