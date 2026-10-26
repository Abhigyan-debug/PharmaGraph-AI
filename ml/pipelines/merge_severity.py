import argparse
import json
import os

import pandas as pd

RANK = {"major": 3, "moderate": 2, "minor": 1, "unknown": 0}


def ddinter_rows(path, map_path):
    with open(path, encoding="utf-8") as f:
        ddinter = pd.DataFrame([json.loads(line)[:3] for line in f], columns=["a", "b", "level"])
    id_map = pd.read_csv(map_path).set_index("ddinter_id").drugbank_id
    a = ddinter.a.map(id_map)
    b = ddinter.b.map(id_map)
    keep = a.notna() & b.notna() & (a != b)
    print(f"DDInter rows: {len(ddinter):,}, both drugs mapped: {keep.sum():,}")
    ddinter, a, b = ddinter[keep], a[keep], b[keep]
    return pd.DataFrame({
        "pair_key": ["__".join(sorted(p)) for p in zip(a, b)],
        "source": "DDInter",
        "severity_raw": ddinter.level.values,
        "severity": ddinter.level.str.lower().values,
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ddinter", default="data/raw/openmrs_ddi/interactions.jsonl")
    parser.add_argument("--ddinter-map", default="data/raw/ddinter_to_drugbank_map.csv")
    parser.add_argument("--ayvaz", default="data/raw/ayvaz_severity.parquet")
    parser.add_argument("--kegg", default="data/raw/kegg_severity.parquet")
    parser.add_argument("--tdc", default="data/raw/tdc_ddi_drugbank.tab")
    parser.add_argument("--out", default="data/processed/severity_by_pair.parquet")
    args = parser.parse_args()

    parts = [ddinter_rows(args.ddinter, args.ddinter_map),
             pd.read_parquet(args.ayvaz)[["pair_key", "source", "severity_raw", "severity"]]]
    if os.path.exists(args.kegg):
        parts.append(pd.read_parquet(args.kegg)[["pair_key", "source", "severity_raw", "severity"]])
    else:
        print(f"no {args.kegg} yet, merging without live KEGG")
    rows = pd.concat(parts, ignore_index=True).drop_duplicates()
    unexpected = set(rows.severity) - set(RANK)
    if unexpected:
        raise ValueError(f"severity values outside the enum: {unexpected}")
    rows["rank"] = rows.severity.map(RANK)
    rows["tag"] = rows.source + ": " + rows.severity_raw.astype(str)

    best = rows.sort_values("rank", ascending=False).drop_duplicates("pair_key")
    grouped = rows.groupby("pair_key")
    merged = pd.DataFrame({
        "severity": best.set_index("pair_key").severity,
        "severity_raw": grouped.tag.agg(lambda t: "; ".join(sorted(set(t)))),
        "sources": grouped.source.agg(lambda s: ",".join(sorted(set(s)))),
    }).reset_index()
    levels = rows[rows["rank"] > 0].groupby("pair_key").severity.nunique()
    merged["conflict"] = merged.pair_key.isin(levels[levels > 1].index)
    ids = merged.pair_key.str.split("__", expand=True)
    merged.insert(1, "drugbank_id_a", ids[0])
    merged.insert(2, "drugbank_id_b", ids[1])

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    merged.to_parquet(args.out, index=False)
    print(f"wrote {len(merged):,} pairs -> {args.out}")

    tdc = pd.read_csv(args.tdc, sep="\t", usecols=["ID1", "ID2"])
    tdc_pairs = set("__".join(sorted(p)) for p in zip(tdc.ID1, tdc.ID2))
    in_tdc = merged[merged.pair_key.isin(tdc_pairs)]
    graded = in_tdc[in_tdc.severity != "unknown"]
    n = len(tdc_pairs)
    print(f"TDC pairs: {n:,}; with a severity: {len(graded):,} ({len(graded) / n:.2%}); "
          f"listed but ungraded: {len(in_tdc) - len(graded):,}")
    print("levels:", graded.severity.value_counts().to_dict())
    print(f"pairs where sources disagree: {graded.conflict.sum():,}")
    for source in sorted(rows.source.unique()):
        alone = rows[(rows.source == source) & (rows["rank"] > 0)].pair_key
        print(f"  {source:8s} grades {alone[alone.isin(tdc_pairs)].nunique():,} TDC pairs")


if __name__ == "__main__":
    main()
