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
