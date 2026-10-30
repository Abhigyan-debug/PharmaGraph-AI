# Product

## Platform

web

## Users

Three audiences, all confirmed 2026-10-26:

- University examiners and the project guide, judging the demo on a laptop or projector.
- Doctors and pharmacists checking a patient's medicine list for interactions.
- Patients and the general public who want to understand what their medicines do together.

## Product Purpose

PharmGraph AI checks 2–10 medicines for drug–drug interactions. It lists the interactions a
source database documents, with severity where a source gives one, and keeps them apart from
interactions a graph neural network predicts but nobody has confirmed. Success is a user who
can tell, within seconds, which pairs are documented, how serious they are, which pairs have no
record, and that no record does not mean safe.

## Positioning

Every claim carries its source: each documented interaction shows the source label that graded
it (`severity_raw`), "contraindicated" appears only when a source says so, and predictions are
never mixed with documented interactions or given a severity.

## Capabilities and Constraints

- Public landing page at `#/` with a quick check that needs no account and isn't saved. The full
  checker, results, history, drug pages (`#/drugs`, `#/drugs/{id}`) and research (`#/research`)
  need an account (2026-10-30).
- Each check is saved to the user's private history; one check or the whole account can be
  deleted. Only email, password hash, sessions and the drug IDs + time of each check are stored.
- Search by generic or brand name, typo-tolerant (`GET /api/v1/drugs/search`).
- Check 2–10 distinct drugs (`POST /api/v1/interactions/known`).
- Severity levels: major, moderate, minor, unknown. 44.80% of documented pairs have one.
- The GCN model is not trained yet; the prediction section is a placeholder.
- React 18 + Vite 5, plain CSS, no UI library. 3Dmol.js (loaded on demand) draws the 3D molecules;
  Motion animates. Dark theme by default, light theme on a toggle.
- Structures come from each drug's SMILES via RDKit: 2D drawing per request, 3D
  model built offline (`ml/pipelines/conformers.py`).

## Evidence on Hand

Real data from TDC DDI DrugBank (1,706 drugs, 191,402 pairs), DDInter 2.0, the Ayvaz et al.
merged set and KEGG. No users, testimonials or clinical validation exist; none may be shown.

## Product Principles

1. Documented and predicted interactions never share a list.
2. Show the source of every claim.
3. No record is never presented as safe.
4. Never show a severity no source gave.

## Accessibility & Inclusion

Readable by non-specialists and on a projector: strong contrast, severity never shown by colour
alone.
