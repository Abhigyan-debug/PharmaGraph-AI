# data/

Everything about where our data comes from. Read this before running any pipeline script.

**Nothing in `raw/` or `processed/` is committed.** The DrugBank license doesn't let us
redistribute their export, and the processed parquet files are too big to be worth it anyway.
What's committed is this file plus `checksums.txt`, so we can all confirm we're working off
the same version.

```
data/
  README.md          <- committed
  checksums.txt      <- committed
  raw/               <- gitignored, you build it yourself
  processed/         <- gitignored, pipelines write here
```

## DrugBank

https://go.drugbank.com/releases/latest

This is the main source — names, DrugBank IDs, synonyms, SMILES, and the documented
interaction pairs with their descriptions.

Needs a free academic account, then a separate approval request for the "Academic /
Non-Commercial" download. **The approval took days last time people tried it**, so whoever is
doing this should request it immediately, not the week we need the data. Until it comes
through we work off openFDA names plus the public TWOSIDES subset.

License: academic/non-commercial, no redistribution. Cite Wishart et al., DrugBank 5.0,
Nucleic Acids Res 2018;46(D1):D1074-82.

Download is the full database XML. Once you have it:

```powershell
python -m ml.pipelines.load_drugbank --input data\raw\full_database.xml --out data\raw
```

That writes `drugs.parquet` and `interactions.parquet`. Then record the hashes:

```powershell
Get-FileHash data\raw\*.parquet -Algorithm SHA256
```

and add the lines to `checksums.txt` so the others can check they have the same release.

Status: not downloaded yet. Release version goes here once it is → _______

## openFDA

https://open.fda.gov/apis/drug/label/

Public API, US government work so public domain, no key needed for what we're doing (limit is
1000 requests/day without one, way more than enough). We pull brand and generic names to
enrich our synonym lists, and occasionally label text to quote in an explanation.

One condition from their side: don't present results as if FDA endorsed them.

We are **not** using openFDA as interaction ground truth. Names and text only.

## TWOSIDES

https://tatonettilab.org/resources/nsides/

Drug pairs that show up together with side effects more often than chance, mined from FAERS
adverse event reports. Downloadable directly, no registration.

Cite: Tatonetti et al., Data-driven prediction of drug effects and interactions, Sci Transl
Med 2012;4(125):125ra31.

The important caveat: **these are not confirmed interactions.** They're a statistical signal
from spontaneous reports, which are noisy and biased. We can feed them into the graph as extra
edges to make it less sparse, but nothing coming out of a TWOSIDES edge gets displayed as a
documented DDI, and anything that leans on them has to say where it came from.

Decide later (commit 20) whether we actually include these or keep the graph DrugBank-only.
Including them helps with sparsity, but muddies what the model is learning. Worth trying both
if there's time.

## PubChem

https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest

Public domain, PUG REST API. We use it to fill gaps — if a drug has no SMILES or no ID in our
DrugBank rows, look it up here by name and pull the CID and canonical SMILES.

Rate limit is 5 requests/second, 400/minute. Put a sleep in the loop or they'll block you.

## ChEMBL

https://www.ebi.ac.uk/chembl/ — CC BY-SA 3.0.

Only relevant if we extend to a drug-target graph. Not in v1.

## What the graph should look like

Nodes are drugs, edges are documented interactions, undirected. Target around 500-2000 drugs.
If the full DrugBank export turns out to be unmanageable, take a subset — 500 drugs is plenty
to train on and the pipeline doesn't care.

Node features are RDKit Morgan fingerprints, radius 2, 2048 bits, straight from SMILES.
Final matrix is `[num_drugs, 2048]`.

Edge split is 70/15/15 train/val/test, split at the **edge** level — val and test edges get
pulled out of the graph the model sees during training. Negatives are randomly sampled
non-edges at 1:1. We should also record what happens at 1:4 since the ratio affects AUPR a
lot and someone will ask about it.

## Known problems with the data

Checked by `ml/pipelines/quality_report.py` in commit 9, results go to
`docs/data-quality-report.md`.

- **Duplicate pairs.** `(A,B)` and `(B,A)` are the same interaction. Fixed by always storing
  the sorted pair as the key — see the data dictionary.
- **Missing SMILES.** Some drugs (biologics especially) just won't have one. Those get
  `supported_for_ml = false`. Known-DDI lookup still works for them, prediction doesn't.
- **Interactions pointing at drugs we don't have.** Drop them, but log the count — if it's a
  big number something's wrong with the ID mapping, not the data.
- **Severity missing or in a format we don't recognise.** Goes to `unknown`. Never guessed.
- **Salt and formulation variants.** "Warfarin" vs "warfarin sodium". We're keeping them
  separate rather than merging — see the data dictionary for why.
- **Cold-start drugs** with zero known interactions. The GCN has nothing to propagate for
  these, so predictions involving them are meaningless. Excluded, and the UI explains it.
