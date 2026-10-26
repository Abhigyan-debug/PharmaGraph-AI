"""Build the DDInter ID -> DrugBank ID map.

DDInter's data uses DDInter's own IDs (DDInter1022). We get a DrugBank ID for
each drug in this order, recorded in the `method` column:

  ddinter  DDInter's own cross-reference. Each DDInter drug page links a
           DrugBank entry; the OpenMRS DDI knowledge base copied those links
           into its drugs.jsonl, and we read them from there.
  kpaths   For drugs DDInter doesn't link: the K-Paths DDInter dataset on
           Hugging Face (Apache 2.0) carries both IDs on every record.
  name     Still nothing: exact match of the normalized name against names
           that come with a DrugBank ID, from K-Paths and from the Ayvaz merged
           set. Only plain names. Entries like "Calcitriol (topical)" are
           formulations and are left out, and so is any name that points at
           more than one DrugBank ID.

The script prints how often the later methods agree with DDInter's own links,
so the numbers can go in the quality report.

Usage:
    python -m ml.pipelines.map_ddinter_ids --out data/raw/ddinter_to_drugbank_map.csv
"""

import argparse
import glob
import json
import re
import unicodedata
from collections import defaultdict

import pandas as pd

from ml.pipelines.load_ayvaz import read_records

DRUGBANK_ID = re.compile(r"DB\d{5}")


def normalize(name):
    # Same rules as name_normalized in docs/data-dictionary.md, plus "_" -> " "
    # because the Ayvaz file writes names like Pyridoxal_Phosphate.
    name = unicodedata.normalize("NFKC", str(name)).replace("_", " ")
    return " ".join(name.split()).lower()


def read_kpaths(paths):
    """(ddinter_id, drugbank_id, name) for both drugs on every K-Paths record."""
    for path in paths:
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                r = json.loads(line)
                yield r["drug_pair"][0], r["drug1_db"], r["drug1_name"]
                yield r["drug_pair"][1], r["drug2_db"], r["drug2_name"]


def ayvaz_names(path):
    """(name, drugbank_id) from the Ayvaz file, skipping its KEGG rows.

    The KEGG rows lost the first letter of every name in the original merge
    ("yridoxal_Phosphate", "-DOPA"), so they would only add noise.
    """
    for fields in read_records(path):
        if len(fields) <= 20 or fields[20].strip() == "Kegg":
            continue
        for uri, name in ((fields[0], fields[1]), (fields[2], fields[3])):
            m = DRUGBANK_ID.search(uri)
            if m and name and name != "None":
                yield name, m.group()


def agreement(label, pairs):
    agree = sum(a == b for a, b in pairs)
    print(f"  {label}: {agree}/{len(pairs)} agree with DDInter's own links "
          f"({agree / len(pairs):.1%})" if pairs else f"  {label}: nothing to compare")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ddinter-drugs", default="data/raw/openmrs_ddi/drugs.jsonl")
    parser.add_argument("--ddinter-csv", default="data/raw/ddinter_downloads_code_*.csv")
    parser.add_argument("--kpaths", nargs="+",
                        default=["data/raw/kpaths_ddinter_train.json", "data/raw/kpaths_ddinter_test.json"])
    parser.add_argument("--ayvaz", default="data/raw/ayvaz_pddi_conservative.csv.bz2")
    parser.add_argument("--out", default="data/raw/ddinter_to_drugbank_map.csv")
    args = parser.parse_args()

    drugs = pd.read_json(args.ddinter_drugs, lines=True)
    names_by_id = dict(zip(drugs.id, drugs.name))
    csv = pd.concat(pd.read_csv(f) for f in sorted(glob.glob(args.ddinter_csv)))
    for ids, names in ((csv.DDInterID_A, csv.Drug_A), (csv.DDInterID_B, csv.Drug_B)):
        for d, n in zip(ids, names):
            names_by_id.setdefault(d, n)
    own = dict(zip(drugs.id[drugs.drugbank_id.notna()], drugs.drugbank_id.dropna()))
    print(f"DDInter drugs: {len(names_by_id)}; linked to DrugBank by DDInter itself: {len(own)}")

    by_kpaths = defaultdict(set)
    kpaths_names = defaultdict(set)
    for ddinter_id, db, name in read_kpaths(args.kpaths):
        by_kpaths[ddinter_id].add(db)
        kpaths_names[normalize(name)].add(db)
    kpaths = {d: next(iter(dbs)) for d, dbs in by_kpaths.items() if len(dbs) == 1}

    ayvaz = defaultdict(set)
    for name, db in ayvaz_names(args.ayvaz):
        ayvaz[normalize(name)].add(db)
    names = defaultdict(set)
    for source in (kpaths_names, ayvaz):
        for name, dbs in source.items():
            names[name] |= dbs

    def match(name, lookup):
        if "(" in name:
            return None
        dbs = lookup.get(normalize(name), set())
        return next(iter(dbs)) if len(dbs) == 1 else None

    # How good are the fallbacks? Check them where DDInter gives the answer.
    # The name check uses Ayvaz names only; K-Paths names would trivially
    # match K-Paths' own IDs.
    print("checks:")
    agreement("K-Paths", [(own[d], kpaths[d]) for d in own if d in kpaths])
    agreement("name match (Ayvaz names)",
              [(own[d], db) for d in own if (db := match(names_by_id[d], ayvaz))])

    rows = []
    for d, name in names_by_id.items():
        if d in own:
            rows.append((d, own[d], "ddinter"))
        elif d in kpaths:
            rows.append((d, kpaths[d], "kpaths"))
        elif db := match(name, names):
            rows.append((d, db, "name"))
    out = pd.DataFrame(rows, columns=["ddinter_id", "drugbank_id", "method"])
    print(f"mapped {len(out)}/{len(names_by_id)}:", out.method.value_counts().to_dict())

    out["n"] = out.ddinter_id.str.replace("DDInter", "").astype(int)
    out.sort_values("n").drop(columns="n").to_csv(args.out, index=False)
    print(f"wrote {len(out)} rows -> {args.out}")


if __name__ == "__main__":
    main()
