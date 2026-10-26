# Data dictionary

The point of this file is that the pipeline, the database and the API all use the same field
names. If you rename something, rename it here in the same commit or we'll waste an evening
debugging why the frontend is getting `undefined`.

Conventions: `snake_case` everywhere including in JSON. IDs are always strings, never ints —
so we can hold external identifiers unchanged. `null` means we don't know, not zero and not
"doesn't apply".

## Drug

One row per medicine. Written by `ml/pipelines/build_tables.py` to
`data/processed/drugs.parquet`, loaded into the `drugs` table.

| field | type | notes |
|---|---|---|
| `drug_id` | str | our own key, `pg_` + 6 digits, e.g. `pg_000123`. Primary key everywhere. Never reused. Handed out in sorted DrugBank order, so sorting by `drug_id` and by `drugbank_id` always agree |
| `name` | str | what the UI shows, e.g. `Warfarin` |
| `name_normalized` | str | lowercased search key, indexed |
| `name_source` | str | where `name` came from: `ddinter` / `kpaths` / `pubchem` / `ayvaz`, or `drugbank_id` when no source had a name |
| `synonyms` | list[str] | RxNorm brand names first, then word-like alternates from PubChem and the other sources; at most 25. Empty list if none, not null |
| `drugbank_id` | str or null | e.g. `DB00682`. Null if the drug came from somewhere else |
| `pubchem_cid` | str or null | stored as string even though it's numeric. Null when PubChem had no match |
| `smiles` | str or null | needed for ML. No SMILES, no features |
| `supported` | bool | searchable and selectable in the UI |
| `supported_for_ml` | bool | SMILES parses in RDKit *and* the drug is in the graph |
| `source` | str | `tdc` for every drug today |
| `dataset_version` | str | `tdc-ddi-drugbank-dataverse-4139573`, ties back to checksums.txt |

Having a SMILES string isn't the same as having a structure. One TDC drug, DB11630, has a
SMILES with a syntax error that RDKit rejects, so it's `supported_for_ml = false`: its
documented interactions are served, but it gets no prediction.

Two separate `supported` flags on purpose: a drug can be perfectly fine to look up known
interactions for while still being useless to the model. Merging them into one flag would hide
half our formulary from search for no reason.

**How names get normalized** (order matters):

1. Unicode NFKC
2. trim, collapse repeated spaces
3. lowercase

That's it — **we do not strip salts.** "warfarin sodium" stays separate from "warfarin". It's
tempting to merge them since they look like the same drug, but the source's interaction
records can differ between forms, and merging would mean inventing interaction data that
isn't there. Cross-linking goes through `synonyms` instead.

`name_normalized` is not unique — two sources can spell the same thing the same way and we
keep both rows. `drug_id` is the only unique key. What *must* hold is that one DrugBank ID
maps to exactly one `drug_id`; that's the check that gates commit 8.

## KnownInteraction

Documented interactions only. Nothing from the model goes in here. Written by
`ml/pipelines/build_tables.py` to `data/processed/known_interactions.parquet`.

| field | type | notes |
|---|---|---|
| `interaction_id` | str | `ddi_` + 6 digits |
| `pair_key` | str | `"__".join(sorted([a, b]))` over the two `drug_id`s |
| `drug_a_id` | str | FK to drugs. Always the smaller of the two IDs |
| `drug_b_id` | str | always the larger |
| `interaction_type` | int | TDC's interaction type, 1–86. Each type has one sentence template |
| `description` | str | TDC's sentence with the drug names filled in, e.g. "Aspirin may increase the anticoagulant activities of Warfarin." Keeps TDC's own direction |
| `source` | str | `tdc` — where the interaction itself comes from. Always shown to the user |
| `severity_display` | str | our mapped enum, see below. Same on every row of a pair |
| `severity_raw` | str or null | every source's own label, e.g. `DDInter: Major; FrenchDB: PC`. Never edited. Null when no source has the pair |
| `severity_sources` | str or null | the sources behind `severity_raw`, comma-separated |
| `dataset_version` | str | same as on Drug |

The key is `(pair_key, interaction_type)`, not `pair_key` alone. TDC lists 406 pairs twice,
and we checked every one: it's always two different interaction types, two documented
effects of the same pair (289 in the same direction, 117 reversed). Collapsing them to one row
would throw a real interaction away, so the table has 191,808 rows over 191,402 pairs.

Things that should always be true, checked by `build_tables.py` every time it runs:
`drug_a_id` sorts before `drug_b_id`, a drug never interacts with itself,
`(pair_key, interaction_type)` is unique, both IDs exist in `drugs`, no description still has
a `#Drug` placeholder, and `severity_display` is one of the four allowed values.

## GraphEdge

What actually goes into the PyG `Data` object. Built in commit 20, split in commit 21.

| field | type | notes |
|---|---|---|
| `src` | int | **row index in the feature matrix, not a drug_id** |
| `dst` | int | same |
| `relation` | str | always `ddi` for now |
| `split` | str | `train` / `val` / `test` |
| `label` | int | 1 = real interaction, 0 = sampled negative |

The `src`/`dst` being integers is the thing that trips people up. The graph works in row
indices, the database works in `drug_id`s, and the bridge between them lives in
`node_features.npz`:

- key `X` — float32 array, shape `[num_drugs, 2048]`
- key `drug_ids` — string array, same length. Position *i* is the `drug_id` for row *i*.

Keep those two together. If they ever get out of sync every prediction silently refers to the
wrong drug and nothing errors out.

**Leakage.** Val and test edges have to be removed from the graph the model passes messages
over during training. If a test edge is still in the adjacency, the encoder has already seen
the answer and the reported AUPR is fiction. Negatives for training get resampled each epoch,
but val and test negatives are fixed with a recorded seed — otherwise the metric moves between
runs and we can't compare anything.

## Prediction (API response)

What the predict endpoint returns per pair. Becomes Pydantic models in commit 25.

| field | type | notes |
|---|---|---|
| `pair` | [str, str] | the two drug_ids, sorted |
| `result_type` | str | `known` or `potential_gnn` |
| `probability` | float or null | 0 to 1, 2 decimals. Null when `result_type` is `known` |
| `confidence_band` | str or null | `low` / `medium` / `high`. Null for known |
| `explanation` | str | template text |
| `disclaimer` | str | constant, always present |

`result_type` is the field the whole safety story hangs on — the frontend branches on it and
renders the two kinds in separate sections. Don't add a code path where the two get
concatenated.

Explanation text for predictions:

> Model score based on graph structure and molecular features; not a confirmed clinical
> interaction.

Disclaimer on everything:

> Decision support only. Not a substitute for professional clinical judgement.

## Severity mapping

Done in the pipeline: `load_ayvaz.py` (`SEVERITY_MAP`), `load_kegg.py` and `merge_severity.py`.
A backend copy for runtime checks comes with commit 13. Anything not in this table becomes
`unknown`. These are the labels that actually appear in our sources:

| source | `major` | `moderate` | `minor` |
|---|---|---|---|
| DDInter | Major | Moderate | Minor |
| French ANSM | CI, AD | PE | PC |
| WorldVistA | Contraindication, Not recommended | Precaution for use | Take into account |
| NDF-RT | Critical | Significant | — |
| OSCAR | 3 | 2 | 1 |
| KEGG (2014 and live) | CI | P | — |
| ONC lists | high-priority | — | non-interruptive |

DDInter's own `Unknown` stays `unknown`. Why each row is mapped the way it is, KEGG's P being
an approximation in particular, is in `docs/decisions.md` (decisions 7, 9 and 10).

Rules around it:

- Never show a level no source gave. Unmapped goes to `unknown`, not to a guess. When sources
  disagree, the most severe of *their* levels is shown (decision 7).
- "Contraindicated" only appears if `severity_raw` has a contraindication label: ANSM or KEGG
  `CI`, or WorldVistA `Contraindication`.
- Keep `severity_raw` on the record even when it doesn't map, so we can audit the decision
  later or extend the table.
- **Predictions never carry a severity at all.** The model answers "is there an interaction",
  not "how bad is it". Putting a severity on a model output would be making it up.

## Confidence bands

Display only, derived from `probability`.

- low: 0.50 – 0.69
- medium: 0.70 – 0.84
- high: 0.85 – 1.00

Anything below 0.50 isn't returned.

These numbers are placeholders. They should come from the validation precision curve in
commit 24, not from us picking round numbers. Whatever we end up with goes in the model report.

## Same thing, different layer

| concept | pipeline | db column | API JSON | React |
|---|---|---|---|---|
| drug key | `drug_id` | `drugs.drug_id` | `id` (search only) | `drugId` |
| name | `name` | `drugs.name` | `name` | `name` |
| pair | `pair_key` | `known_interactions.pair_key` | `pair: [a, b]` | `pair` |
| known vs predicted | — | — | `result_type` | `resultType` |
| severity | `severity_display` | `known_interactions.severity_display` | `severity` | `severity` |
| model score | — | — | `probability` | `probability` |

One annoying inconsistency: the search endpoint returns `{ id, name }` rather than
`{ drug_id, name }`, because that's what the API contract in the plan says. Everywhere else
it's `drug_id`. The frontend maps `id` → `drugId` at the API boundary and nowhere else, so the
weirdness stays in one file.
