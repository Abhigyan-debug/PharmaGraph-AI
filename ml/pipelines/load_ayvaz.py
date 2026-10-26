import argparse
import bz2
import re
from collections import Counter

import pandas as pd

COL_DRUG1, COL_DRUG2 = 0, 2
COL_CONTRAINDICATION, COL_PRECAUTION = 5, 15
COL_SEVERITY, COL_SOURCE = 17, 20

RECORD_START = "http://bio2rdf.org/drugbank:"
DRUGBANK_ID = re.compile(r"DB\d{5}")

SEVERITY_MAP = {
    ("FrenchDB", "CI"): "major",
    ("FrenchDB", "AD"): "major",
    ("FrenchDB", "PE"): "moderate",
    ("FrenchDB", "PC"): "minor",
    ("World-Vista", "contraindication"): "major",
    ("World-Vista", "not recommended"): "major",
    ("World-Vista", "precaution for use"): "moderate",
    ("World-Vista", "take into account"): "minor",
    ("NDF-RT", "critical"): "major",
    ("NDF-RT", "significant"): "moderate",
    ("OSCAR", "3"): "major",
    ("OSCAR", "2"): "moderate",
    ("OSCAR", "1"): "minor",
    ("Kegg", "CI"): "major",
    ("Kegg", "P"): "moderate",
    ("ONC-HighPriority", "high-priority"): "major",
    ("ONC-NonInteruptive", "non-interruptive"): "minor",
}

WORLDVISTA_FIXES = {
    "contrandication": "contraindication",
    "c0ntraindication": "contraindication",
    "not recommeded": "not recommended",
    "nor recommended": "not recommended",
    "not recommended with": "not recommended",
    "tale into account": "take into account",
}


def read_records(path):
    with bz2.open(path, "rt", encoding="utf-8", errors="replace") as f:
        next(f)
        buf = None
        for line in f:
            line = line.rstrip("\r\n")
            if line.startswith(RECORD_START):
                if buf is not None:
                    yield buf.split("\t")
                buf = line
            elif buf is not None:
                buf += line
        if buf is not None:
            yield buf.split("\t")


def raw_label(fields):
    source = fields[COL_SOURCE].strip()
    if source == "Kegg":
        if fields[COL_CONTRAINDICATION].strip() == "True":
            return "CI"
        if fields[COL_PRECAUTION].strip() == "True":
            return "P"
        return None
    if source == "ONC-HighPriority":
        return "high-priority"
    if source == "ONC-NonInteruptive":
        return "non-interruptive"

    label = fields[COL_SEVERITY].strip()
    if label in ("", "None"):
        return None
    if source in ("World-Vista", "NDF-RT"):
        label = label.lower().rstrip(":").strip()
        label = WORLDVISTA_FIXES.get(label, label)
    return label


def load(path):
    rows = []
    skipped = Counter()
    for fields in read_records(path):
        if len(fields) <= COL_SOURCE:
            skipped["short record"] += 1
            continue
        a = DRUGBANK_ID.search(fields[COL_DRUG1])
        b = DRUGBANK_ID.search(fields[COL_DRUG2])
        if not (a and b):
            skipped["no DrugBank ID"] += 1
            continue
        a, b = a.group(), b.group()
        if a == b:
            skipped["self pair"] += 1
            continue

        source = fields[COL_SOURCE].strip()
        label = raw_label(fields)
        if label is None:
            skipped["no severity"] += 1
            continue
        severity = SEVERITY_MAP.get((source, label))
        if severity is None:
            skipped[f"unmapped label {source}:{label}"] += 1
            continue

        a, b = sorted([a, b])
        rows.append({
            "pair_key": f"{a}__{b}",
            "drugbank_id_a": a,
            "drugbank_id_b": b,
            "source": source,
            "severity_raw": label,
            "severity": severity,
        })

    df = pd.DataFrame(rows).drop_duplicates(["pair_key", "source", "severity_raw"])
    return df, skipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/raw/ayvaz_pddi_conservative.csv.bz2")
    parser.add_argument("--out", default="data/raw/ayvaz_severity.parquet")
    args = parser.parse_args()

    df, skipped = load(args.input)
    df.to_parquet(args.out, index=False)

    print(f"wrote {len(df):,} rows, {df.pair_key.nunique():,} unique pairs -> {args.out}")
    print(df.groupby(["source", "severity"]).size().unstack(fill_value=0).to_string())
    print("skipped:")
    for reason, n in skipped.most_common():
        print(f"  {reason}: {n:,}")


if __name__ == "__main__":
    main()
