# Learning log

What was built, how it works, and the concepts behind it. Newest first.

## 2026-10-26 — `ml/pipelines/quality_report.py` (commit 9)

**Problem.** Quality numbers lived in script output and chat. A report typed by hand goes
stale the moment the data changes.

**Approach.** The script reads the real files and *writes* `docs/data-quality-report.md`.
Nobody edits the `.md`; rerunning the script refreshes it.

- `sha256()` reads the file in 1 MB chunks: `iter(lambda: f.read(1 << 20), b"")` keeps calling
  `f.read` until it returns empty bytes. `1 << 20` is 2 to the power 20, i.e. 1,048,576. Chunks
  mean a 400 MB file never has to fit in memory at once.
- `input_files()` compares each fingerprint in `data/checksums.txt` with the file on disk. A
  mismatch means someone's data differs from the recorded version.
- `severity_section()` rebuilds the coverage in the order sources were added. For each graded
  pair it collects the sources that really grade it, leaving out `DDInter: Unknown` (a record
  with no grade), then counts how many pairs are covered as each group of sources is added.
- The orphan check asks: does every `drug_a_id` and `drug_b_id` exist in the drugs table?

**Learned.** The first hand count of "graded by two or more sources" was 33,719. It counted
DDInter's "Unknown" as a grade. The script, counting only real grades, gives 32,742. A script
with a written-down rule caught a mistake the hand count made.

## 2026-10-26 — `ml/pipelines/build_tables.py` (commits 8 and 10)

**Problem.** The data sat in separate files: TDC pairs, merged severity, drug names from three
sources. The backend needs two clean tables it can load straight into PostgreSQL.

**Output.** `data/processed/drugs.parquet` (one row per drug) and
`data/processed/known_interactions.parquet` (one row per documented interaction).

### `pick_names()`

Collects every name each DrugBank ID has in DDInter, K-Paths, PubChem and the Ayvaz set, then
picks one with a sort key of three parts:

```python
key=lambda c: ("(" in c[1], NAME_PRIORITY[c[0]], len(c[1]))
```

(The real key has one more part, `len(c[1]) > READABLE_NAME`, explained below.)

Python sorts tuples part by part, left to right. `False` sorts before `True`, so plain names
come before names with a bracket ("Ketorolac" before "Ketorolac (ophthalmic)"), and short names
before names over 40 characters. Ties go to the more trusted source (`NAME_PRIORITY`: DDInter 0,
K-Paths 1, PubChem 2, Ayvaz 3), then the shorter spelling.

Some drugs only have a PubChem title, and that title can be a full IUPAC name hundreds of
characters long. For those, PubChem's *first* synonym is offered too, but only if it looks like
a word. Later synonyms aren't trusted: for DB00568 the first word-like one is "Cinna", a brand
fragment, and a wrong name in a medicine app is worse than a long correct one. Seven drugs keep
their long chemical names for that reason.

### `clean_synonyms()`

Brand names come first, because they're what people type ("Coumadin", not "warfarin"). They come
from RxNorm, through the OpenMRS knowledge base, which already filtered out junk, so they're
kept as they are. PubChem's own synonym lists mix real names with codes ("UNII-5Q7ZVV76EI", CAS
numbers), so those go through the regex `^[A-Za-z][A-Za-z \-']{2,39}$`: start with a letter,
then only letters, spaces, hyphens and apostrophes, 3–40 characters. `normalize()` (from
`map_ddinter_ids.py`) lowercases and trims, so "Coumadin" and "COUMADIN" count as one. At most
25 are kept.

The first version used only PubChem and capped the list at 15. Warfarin then had "Dethmor" and
"Kumader" (rat-poison trade names) but not "Coumadin", which wasn't in PubChem's first 60 at all.
That's why the RxNorm brands were added.

### `build_drugs()`

`enumerate(sorted(smiles), start=1)` hands out `pg_000001`, `pg_000002`... in DrugBank-ID order.
`f"pg_{i:06d}"` pads the number to six digits. Because the order is the same, a pair sorted by
`drug_id` comes out the same way round as one sorted by DrugBank ID, so the pipeline (which works
in DrugBank IDs) and the database (which works in `drug_id`s) can't disagree about which drug is
`drug_a`.

`supported_for_ml` is `Chem.MolFromSmiles(...) is not None`: RDKit returns `None` when it can't
read a SMILES. That's how DB11630 was caught.

### `build_interactions()`

- `t.ID1.map(drug_id)` looks each DrugBank ID up in a dict and returns the `drug_id`.
- `a.where(a < b, b)` keeps `a` where the condition is true and takes `b` elsewhere, so
  `drug_a_id` is always the smaller ID. The same trick the other way gives `drug_b_id`.
- The description replaces `#Drug1` with the name of `ID1` and `#Drug2` with `ID2`. TDC's
  sentences have a direction ("A increases the effect of B"), so this keeps TDC's own order,
  not the sorted one.
- Severity is looked up by the DrugBank pair key that `merge_severity.py` used. `.fillna("unknown")`
  fills pairs no source grades.

### `check()`

Stops the build with a `ValueError` if any rule from `docs/data-dictionary.md` breaks. A wrong
table should fail here, loudly, not later as a strange API answer.

**Things learned while building it**

- TDC's 406 "duplicate" pairs aren't duplicates: each is two different interaction types. The
  table key had to become `(pair_key, interaction_type)`.
- Having a SMILES string doesn't mean having a valid structure (DB11630).
