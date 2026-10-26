import argparse
import datetime
import hashlib
import json
import os

import pandas as pd

AYVAZ_SOURCES = {"FrenchDB", "Kegg", "NDF-RT", "OSCAR", "World-Vista",
                 "ONC-HighPriority", "ONC-NonInteruptive"}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def input_files(checksums_path, raw_dir):
    lines = ["## Input files", "",
             "Each file recorded in `data/checksums.txt`, checked against the copy on disk.", "",
             "| File | Recorded | On disk |", "|---|---|---|"]
    with open(checksums_path, encoding="utf-8") as f:
        for line in f:
            if not line.strip() or line.startswith("#"):
                continue
            recorded, name = line.split(maxsplit=2)[:2]
            path = os.path.join(raw_dir, name)
            if not os.path.exists(path):
                status = "missing"
            else:
                status = "matches" if sha256(path) == recorded else "**different**"
            lines.append(f"| `{name}` | `{recorded[:12]}…` | {status} |")
    return lines + [""]


def graph_section(tdc, drugs):
    pairs = ["__".join(sorted(p)) for p in zip(tdc.ID1, tdc.ID2)]
    per_pair = pd.Series(pairs).value_counts()
    return ["## TDC interaction graph", "",
            "| Measure | Value |", "|---|---|",
            f"| Rows | {len(tdc):,} |",
            f"| Unique drug pairs | {len(per_pair):,} |",
            f"| Pairs listed twice (two different interaction types, both kept) | {(per_pair > 1).sum():,} |",
            f"| Drugs | {len(drugs):,} |",
            f"| Interaction types | {tdc.Y.nunique()} |",
            f"| Drugs with a SMILES string | {drugs.smiles.notna().sum():,} |",
            f"| SMILES that RDKit can read | {drugs.supported_for_ml.sum():,} |",
            f"| Null values in the TDC file | {int(tdc.isna().sum().sum())} |", ""]


def drugs_section(drugs, readable=40):
    sources = drugs.name_source.value_counts()
    long_names = drugs[drugs.name.str.len() > readable]
    no_ml = drugs[~drugs.supported_for_ml]
    lines = ["## Drugs table", "",
             "| Measure | Value |", "|---|---|",
             *[f"| Name from {s} | {n:,} |" for s, n in sources.items()],
             f"| Drugs with at least one synonym | {(drugs.synonyms.str.len() > 0).sum():,} |",
             f"| Drugs with a PubChem CID | {drugs.pubchem_cid.notna().sum():,} |", ""]
    if len(no_ml):
        lines += ["Not usable for the model (SMILES doesn't parse), so no prediction is made for these. "
                  "Their documented interactions are still served:", ""]
        lines += [f"- {r.drugbank_id} ({r['name']})" for _, r in no_ml.iterrows()] + [""]
    if len(long_names):
        lines += [f"Names longer than {readable} characters. No source has a common name for these, "
                  "so they keep their correct chemical name:", ""]
        lines += [f"- {r.drugbank_id}: {r['name'][:60]}…" for _, r in long_names.iterrows()] + [""]
    return lines


def mapping_section(map_csv, ddinter_interactions):
    m = pd.read_csv(map_csv)
    ids = set(m.ddinter_id)
    with open(ddinter_interactions, encoding="utf-8") as f:
        rows = [json.loads(line)[:2] for line in f]
    usable = sum(1 for a, b in rows if a in ids and b in ids)
    return ["## DDInter to DrugBank mapping", "",
            "| Measure | Value |", "|---|---|",
            *[f"| Mapped by {method} | {n:,} |" for method, n in m.method.value_counts().items()],
            f"| DDInter interaction rows with both drugs mapped | {usable:,} of {len(rows):,} "
            f"({usable / len(rows):.1%}) |", ""]


def severity_section(interactions, drugs):
    pairs = interactions.drop_duplicates("pair_key")
    n = len(pairs)
    graded = pairs[pairs.severity_display != "unknown"]
    tags = graded.severity_raw.str.split("; ")
    graders = tags.apply(lambda ts: {t.split(": ")[0] for t in ts if t != "DDInter: Unknown"})

    steps, have = [], set()
    for label, add in [("DDInter 2.0 (full table)", {"DDInter"}),
                       ("+ Ayvaz et al. merged set", AYVAZ_SOURCES),
                       ("+ live KEGG", {"KEGG"})]:
        have |= add
        covered = graders.apply(lambda g: bool(g & have)).sum()
        steps.append(f"| {label} | {covered:,} | {covered / n:.2%} |")

    known = set(drugs.drug_id)
    orphans = (~interactions.drug_a_id.isin(known) | ~interactions.drug_b_id.isin(known)).sum()
    levels = graded.severity_display.value_counts()
    many = (graders.str.len() > 1).sum()
    return ["## Severity coverage of TDC pairs", "",
            "Severity is per pair. A pair counts as graded only if a source gives major, moderate or minor.", "",
            "| Sources included | Graded pairs | Share of all TDC pairs |", "|---|---|---|",
            *steps, "",
            "| Measure | Value |", "|---|---|",
            *[f"| {lvl} | {cnt:,} |" for lvl, cnt in levels.items()],
            f"| Listed by DDInter but rated Unknown, no other source | "
            f"{(pairs.severity_raw.notna() & (pairs.severity_display == 'unknown')).sum():,} |",
            f"| No source has the pair | {pairs.severity_raw.isna().sum():,} |",
            f"| Graded by two or more sources | {many:,} |",
            f"| Interactions pointing at a drug missing from the drugs table | {orphans} |", ""]


def conflicts_line(severity_by_pair, drugs, interactions):
    db = dict(zip(drugs.drug_id, drugs.drugbank_id))
    tdc_db_pairs = {"__".join(sorted([db[a], db[b]]))
                    for a, b in zip(interactions.drug_a_id, interactions.drug_b_id)}
    in_tdc = severity_by_pair[severity_by_pair.pair_key.isin(tdc_db_pairs)]
    return [f"Sources disagree on the level for {int(in_tdc.conflict.sum()):,} graded TDC pairs. "
            "The most severe level is shown and every source's own label is kept in `severity_raw` "
            "(decision 7).", ""]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tdc", default="data/raw/tdc_ddi_drugbank.tab")
    parser.add_argument("--drugs", default="data/processed/drugs.parquet")
    parser.add_argument("--interactions", default="data/processed/known_interactions.parquet")
    parser.add_argument("--severity", default="data/processed/severity_by_pair.parquet")
    parser.add_argument("--ddinter-map", default="data/raw/ddinter_to_drugbank_map.csv")
    parser.add_argument("--ddinter-interactions", default="data/raw/openmrs_ddi/interactions.jsonl")
    parser.add_argument("--checksums", default="data/checksums.txt")
    parser.add_argument("--raw-dir", default="data/raw")
    parser.add_argument("--out", default="docs/data-quality-report.md")
    args = parser.parse_args()

    tdc = pd.read_csv(args.tdc, sep="\t")
    drugs = pd.read_parquet(args.drugs)
    interactions = pd.read_parquet(args.interactions)

    lines = ["# Data quality report", "",
             f"Generated by `ml/pipelines/quality_report.py` on {datetime.date.today()}. "
             "Don't edit this file by hand; rerun the script.", ""]
    lines += input_files(args.checksums, args.raw_dir)
    lines += graph_section(tdc, drugs)
    lines += drugs_section(drugs)
    lines += mapping_section(args.ddinter_map, args.ddinter_interactions)
    lines += severity_section(interactions, drugs)
    lines += conflicts_line(pd.read_parquet(args.severity), drugs, interactions)

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
