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
| RDKit | Python chemistry library. We use it to read SMILES and, later, to make fingerprints |
| Morgan fingerprint | A fixed-length list of 0s and 1s (2048 here) marking which small chemical patterns a molecule has. It's what the model sees for each drug |
| InChIKey | A fixed-length code computed from a structure. Its first block depends only on how atoms connect, which is how we match KEGG drugs to ours |
| Salt form | The same active drug packaged with a counter-ion, e.g. warfarin sodium. We match KEGG's salt forms to the parent drug |
| PubChem CID | PubChem's identifier for a compound |
| ATC | Anatomical Therapeutic Chemical classification. DDInter splits its download by ATC letter (C = cardiovascular, N = nervous system...) |
| CI / P | KEGG's two labels: contraindicated, and precaution |
| ANSM | The French medicines agency; its interaction thesaurus is one of our severity sources |
| Parquet | A compressed table file format that pandas reads and writes quickly |
| Checksum (SHA-256) | A fingerprint of a file's bytes. If two people's checksums match, they have the identical file |
| Rate limit / HTTP 429 | A server refusing requests because too many came too fast. PubChem did this to us once |
| GCN | Graph Convolutional Network: a model that learns from a drug's own features and its neighbours in the interaction graph |
| AUPR | Area under the precision–recall curve. Our main score, because real interactions are rare among all possible pairs |
| Edge split | Dividing the known interactions into train / validation / test sets, so the model is tested on pairs it never saw |
