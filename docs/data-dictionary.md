# Data dictionary

The point of this file is that the pipeline, the database and the API all use the same field
names. If you rename something, rename it here in the same commit or we'll waste an evening
debugging why the frontend is getting `undefined`.

Conventions: `snake_case` everywhere including in JSON. IDs are always strings, never ints —
so we can hold external identifiers unchanged. `null` means we don't know, not zero and not
"doesn't apply".

## Drug

One row per medicine. Written by `normalize_ids.py` to
`data/processed/drugs_normalized.parquet`, loaded into the `drugs` table.

| field | type | notes |
|---|---|---|
| `drug_id` | str | our own key, `pg_` + 6 digits, e.g. `pg_000123`. Primary key everywhere. Never reused. |
| `name` | str | what the UI shows, e.g. `Warfarin` |
| `name_normalized` | str | lowercased search key, indexed |
| `synonyms` | list[str] | brand names and alternates. Empty list if none, not null |
| `drugbank_id` | str or null | e.g. `DB00682`. Null if the drug came from somewhere else |
| `pubchem_cid` | str or null | stored as string even though it's numeric |
| `smiles` | str or null | needed for ML. No SMILES, no features |
| `supported` | bool | searchable and selectable in the UI |
| `supported_for_ml` | bool | SMILES parses in RDKit *and* the drug is in the graph |
| `source` | str | `drugbank` / `openfda` / `pubchem` / `manual` |
| `dataset_version` | str | e.g. `drugbank-5.1.10`, ties back to checksums.txt |

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

Documented interactions only. Nothing from the model goes in here.

| field | type | notes |
|---|---|---|
| `interaction_id` | str | `ddi_` + digits |
| `drug_a_id` | str | FK to drugs. Always the smaller of the two IDs |
| `drug_b_id` | str | always the larger |
| `pair_key` | str | `"__".join(sorted([a, b]))`. Unique. This is what kills duplicates |
| `source` | str | `drugbank` / `openfda` / `twosides` / `manual` — always shown to the user |
| `severity_raw` | str or null | exactly what the source wrote. Never edited |
| `severity_display` | str | our mapped enum, see below |
| `description` | str or null | source text, shown as-is |
| `dataset_version` | str | same as on Drug |

The `pair_key` thing is worth being careful about. DrugBank lists interactions from both
drugs' perspectives, so you get `(A,B)` and `(B,A)` as separate records saying the same thing.
Sorting the IDs and joining gives one canonical key, and a unique constraint on it means the
duplicates collapse on insert instead of us having to remember to dedupe at query time.

Things that should always be true, checked in the commit 9 quality report: `drug_a_id` sorts
before `drug_b_id`, a drug never interacts with itself, `pair_key` is unique, and both IDs
exist in `drugs`.

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

Lives in `backend/app/services/severity.py` (commit 13) with unit tests. Anything not in this
table becomes `unknown`.

| we show | source strings |
|---|---|
| `major` | Major, High, Serious |
| `moderate` | Moderate, Medium |
| `minor` | Minor, Low |
| `unknown` | null, empty, Unknown, anything unrecognised |

Rules around it:

- Never upgrade a severity. Unmapped goes to `unknown`, not to a guess.
- "Contraindicated" only appears if `severity_raw` literally contains it.
- Keep `severity_raw` on the record even when it doesn't map, so we can audit the decision
  later or extend the table.
- **Predictions never carry a severity at all.** The model answers "is there an interaction",
  not "how bad is it". Putting a severity on a model output would be making it up.

TODO: the source strings above are from the DrugBank docs. Once we actually have the export,
check what values really appear and update this — there are probably variants we haven't seen.

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
