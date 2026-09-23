# Scope — PharmGraph AI v1

Neural Cyphers T-100, GLA University Mathura.

## What we're building

A web app where you type in the medicines you're taking, pick a few, and get back two
separate lists:

- the interactions that are already documented in a drug database, and
- the interactions our GNN *thinks* might exist but nobody has confirmed.

The second list is the actual project. The first one is there because without it the second
one has no context — if we only showed model predictions, there'd be no way to tell whether
the model is saying anything sensible.

The whole thing is decision support for a mini-project demo. It doesn't prescribe anything
and it isn't meant to be used by an actual patient.

Flow we're demoing in week 8:

```
search → select 2-3 medicines → known interactions → run GNN → probability + explanation
```

## What's in v1

Drug search with autocomplete. Known DDI lookup for every pair among the selected drugs.
Severity shown for known interactions where the source gives one. GNN scoring for the same
pairs, with a probability and a rough confidence level. A short explanation under each
result, and a limitations page linked from everywhere.

Plus the boring but graded stuff: a data quality report, a model card with metrics, and
enough notes that someone could rebuild our results.

## Product boundaries

Two things stay out permanently, not just in v1. PharmGraph AI does not prescribe and does not
suggest dosages — it reports what the sources say and what the model scores, and the clinician
decides. And it stores nothing about a patient: no login, no accounts, no history. The only
thing a user ever sends us is a list of drug IDs, so there is no patient data to protect in
the first place.

## Future scope

Deferred out of v1 to keep the build finishable in eight weeks. Each of these is a reasonable
next step once the core checker works.

**Food–drug and drug–disease interactions.** Same idea, different data and a different graph
schema — food and condition nodes alongside drug nodes. Would make the tool far more useful in
practice, but the data sourcing alone is a project of its own.

**Interaction type prediction.** Right now the model answers a binary question: does an
interaction exist between these two drugs. The more useful question is what *kind* —
pharmacokinetic vs pharmacodynamic, or the specific mechanism. That's a multi-class problem and
it needs labels we don't have at sufficient quality yet.

**Pharmacogenomic interactions.** Gene–drug effects, where the same pair behaves differently
depending on the patient's genotype. Needs genomic reference data we don't have licensed.

**Richer graph, better predictions.** Adding drug–target and drug–gene edges from ChEMBL turns
this into a heterogeneous knowledge graph, which is the direction KGNN (IJCAI 2020) takes. Our
current graph only has drug–drug edges, so cold-start drugs have nothing to learn from; target
edges would give them a neighbourhood.

**Mobile app and EHR integration.** The obvious deployment path if this ever went past a
prototype. Web-only for now.


## Rules we agreed on

These came out of the discussion about what could go wrong if someone actually used this.

**Known and predicted never go in the same list.** Two sections, visually different. If we
merge them the user has no idea which claims have evidence behind them.

**Severity only where the source says so.** If DrugBank doesn't give a severity for a pair,
it shows as "unknown". We do not infer it, and we definitely don't infer it from the model
score — the model predicts whether an interaction exists, not how dangerous it is.

**Don't escalate the wording.** "Contraindicated" only appears if the source record itself
says contraindicated.

**If the model file is missing, still serve known interactions.** Whole app failing because
a .pt file didn't load would be a bad demo.

**No prediction for drugs without SMILES.** No SMILES means no fingerprint means no node
features, so whatever the model outputs for that drug is noise. UI says why instead of
showing a number.

**Version everything.** Dataset version on every row, seed recorded for every training run.
Otherwise we can't explain our own numbers during the viva.

## Data sources

Details, licenses and download steps are in [data/README.md](../data/README.md). Short version:

- **DrugBank** — the main one. Drug names, SMILES, documented interactions. Needs an academic
  account and approval takes a few days, so this is on the critical path.
- **openFDA** — public API, free. We use it for extra names/synonyms and label text. Not used
  as training labels.
- **TWOSIDES** — drug pairs from side-effect co-occurrence. Useful as extra graph edges, but
  these are statistical signals from adverse event reports, not confirmed interactions. If we
  use them, anything derived from them has to say so.
- **PubChem** — for filling in a SMILES or CID when DrugBank doesn't have one.
- **ChEMBL** — only if we get time to try a heterogeneous graph. Probably won't.

Two things that aren't negotiable: we don't commit the raw DrugBank export anywhere (license
forbids redistributing it), and every interaction we show keeps its `source` field so it can
be traced back.

## How we know it worked

The demo has to run end to end — search, pick three drugs, both sections render, nothing
crashes. API tests passing, including the annoying cases (unknown drug ID, empty selection,
a pair with no interaction at all).

For the model: the sklearn baseline has to beat random by a real margin, and the GCN has to
beat the baseline on **test AUPR**. AUPR and not AUROC because interacting pairs are rare
compared to all possible pairs, and AUROC makes that look better than it is. If the GCN
doesn't beat the baseline, we report that honestly and ship the known-DDI checker — that's
the fallback in the risk table and it's fine.

Also needed at hand-in: model card, reproducibility notes, limitations page, screenshots.

## The paper we're following

**DPDDI: a deep predictor for drug–drug interactions.** Liu et al., BMC Bioinformatics 21:419
(2020). https://doi.org/10.1186/s12859-020-03724-x

Worth reading properly because our architecture is basically theirs:

1. GCN over the known-interaction graph → an embedding per drug
2. concatenate the two drug embeddings for a pair
3. MLP → sigmoid

The reason a GCN makes sense here is that the interaction network is itself informative —
drugs that interact with the same set of other drugs tend to interact with each other. A GCN
picks that up from the topology instead of us hand-coding a similarity rule.

They report AUROC, AUPR and F1 against feature-only baselines, which is the same comparison
we're doing in commits 22–24. Their stated limitation is also ours: the model degrades when
the network is sparse and does badly on drugs with few known interactions. That's why we
block predictions on cold-start drugs.

KGNN (IJCAI 2020, https://www.ijcai.org/proceedings/2020/0380.pdf) is the backup reference if
we end up adding drug-target edges. Not planned for v1.
