import argparse
import json
import os
import re
from collections import defaultdict

import pandas as pd
from rdkit import Chem, RDLogger

from ml.pipelines.map_ddinter_ids import ayvaz_names, normalize, read_kpaths

RDLogger.DisableLog("rdApp.*")

DATASET_VERSION = "tdc-ddi-drugbank-dataverse-4139573"
SEVERITIES = {"major", "moderate", "minor", "unknown"}
NAME_PRIORITY = {"ddinter": 0, "kpaths": 1, "pubchem": 2, "ayvaz": 3}

WORD_LIKE = re.compile(r"^[A-Za-z][A-Za-z \-']{2,39}$")
MAX_SYNONYMS = 25
READABLE_NAME = 40


def pick_names(drug_ids, ddinter_drugs, kpaths_paths, ayvaz_path, pubchem):
    candidates = defaultdict(list)
    for d in ddinter_drugs:
        if d.get("drugbank_id"):
            candidates[d["drugbank_id"]].append(("ddinter", d["name"]))
    for _, db, name in read_kpaths(kpaths_paths):
        candidates[db].append(("kpaths", name))
    for db, entry in pubchem.items():
        title = entry.get("title")
        if title:
            candidates[db].append(("pubchem", title))
        first = (entry.get("synonyms") or [None])[0]
        if title and len(title) > READABLE_NAME and first and WORD_LIKE.match(first):
            candidates[db].append(("pubchem", first))
    for name, db in ayvaz_names(ayvaz_path):
        candidates[db].append(("ayvaz", name.replace("_", " ")))

    chosen, others = {}, {}
    for db in drug_ids:
        names = candidates.get(db, [])
        ranked = sorted(names, key=lambda c: (
            "(" in c[1], len(c[1]) > READABLE_NAME, NAME_PRIORITY[c[0]], len(c[1])))
        if ranked:
            chosen[db] = (ranked[0][1], ranked[0][0])
        else:
            chosen[db] = (db, "drugbank_id")
        others[db] = {n for _, n in names}
    return chosen, others


def clean_synonyms(brands, other_names, display_name):
    seen = {normalize(display_name)}
    kept = []
    for n in list(brands) + [n for n in other_names if WORD_LIKE.match(n)]:
        key = normalize(n)
        if key not in seen:
            seen.add(key)
            kept.append(n)
        if len(kept) == MAX_SYNONYMS:
            break
    return kept


def build_drugs(tdc, chosen, others, brands, pubchem):
    smiles = dict(zip(tdc.ID1, tdc.X1)) | dict(zip(tdc.ID2, tdc.X2))
    rows = []
    for i, db in enumerate(sorted(smiles), start=1):
        name, name_source = chosen[db]
        entry = pubchem.get(db, {})
        cid = entry.get("cid")
        rows.append({
            "drug_id": f"pg_{i:06d}",
            "name": name,
            "name_normalized": normalize(name),
            "name_source": name_source,
            "synonyms": clean_synonyms(sorted(brands.get(db, [])),
                                       sorted(others[db]) + entry.get("synonyms", []), name),
            "drugbank_id": db,
            "pubchem_cid": str(cid) if cid else None,
            "smiles": smiles[db],
            "supported": True,
            "supported_for_ml": Chem.MolFromSmiles(smiles[db]) is not None,
            "source": "tdc",
            "dataset_version": DATASET_VERSION,
        })
    return pd.DataFrame(rows)


def build_interactions(tdc, drugs, severity):
    drug_id = dict(zip(drugs.drugbank_id, drugs.drug_id))
    name = dict(zip(drugs.drugbank_id, drugs.name))
    sev = severity.set_index("pair_key")

    t = tdc[["ID1", "ID2", "Y", "Map"]].copy()
    t["db_pair"] = ["__".join(sorted(p)) for p in zip(t.ID1, t.ID2)]
    a = t.ID1.map(drug_id)
    b = t.ID2.map(drug_id)
    t["drug_a_id"] = a.where(a < b, b)
    t["drug_b_id"] = b.where(a < b, a)
    t["pair_key"] = t.drug_a_id + "__" + t.drug_b_id
    t["description"] = [
        m.replace("#Drug1", name[d1]).replace("#Drug2", name[d2])
        for m, d1, d2 in zip(t.Map, t.ID1, t.ID2)
    ]
    t["severity_display"] = t.db_pair.map(sev.severity).fillna("unknown")
    t["severity_raw"] = t.db_pair.map(sev.severity_raw)
    t["severity_sources"] = t.db_pair.map(sev.sources)

    t = t.sort_values(["pair_key", "Y"]).reset_index(drop=True)
    t.insert(0, "interaction_id", [f"ddi_{i:06d}" for i in range(1, len(t) + 1)])
    return t.assign(interaction_type=t.Y, source="tdc", dataset_version=DATASET_VERSION)[[
        "interaction_id", "pair_key", "drug_a_id", "drug_b_id", "interaction_type",
        "description", "source", "severity_display", "severity_raw", "severity_sources",
        "dataset_version",
    ]]


def check(drugs, interactions):
    problems = []
    if not drugs.drug_id.is_unique:
        problems.append("drug_id is not unique")
    if not drugs.drugbank_id.is_unique:
        problems.append("one DrugBank ID maps to more than one drug_id")
    if interactions.duplicated(["pair_key", "interaction_type"]).any():
        problems.append("repeated (pair_key, interaction_type)")
    if not (interactions.drug_a_id < interactions.drug_b_id).all():
        problems.append("drug_a_id does not sort before drug_b_id (or a drug interacts with itself)")
    known = set(drugs.drug_id)
    if not (interactions.drug_a_id.isin(known) & interactions.drug_b_id.isin(known)).all():
        problems.append("interaction points at a drug that is not in drugs")
    if interactions.description.str.contains("#Drug").any():
        problems.append("description still has a #Drug placeholder")
    if not set(interactions.severity_display) <= SEVERITIES:
        problems.append(f"severity outside {sorted(SEVERITIES)}")
    if problems:
        raise ValueError("table checks failed: " + "; ".join(problems))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tdc", default="data/raw/tdc_ddi_drugbank.tab")
    parser.add_argument("--severity", default="data/processed/severity_by_pair.parquet")
    parser.add_argument("--ddinter-kb", default="data/raw/openmrs_ddi/ddi_knowledge_base.json")
    parser.add_argument("--kpaths", nargs="+",
                        default=["data/raw/kpaths_ddinter_train.json", "data/raw/kpaths_ddinter_test.json"])
    parser.add_argument("--ayvaz", default="data/raw/ayvaz_pddi_conservative.csv.bz2")
    parser.add_argument("--pubchem", default="data/raw/pubchem_drugs.json")
    parser.add_argument("--out", default="data/processed")
    args = parser.parse_args()

    tdc = pd.read_csv(args.tdc, sep="\t")
    pubchem = {}
    if os.path.exists(args.pubchem):
        with open(args.pubchem, encoding="utf-8") as f:
            pubchem = json.load(f)

    with open(args.ddinter_kb, encoding="utf-8") as f:
        kb_drugs = json.load(f)["drugs"]
    brands = defaultdict(set)
    for d in kb_drugs:
        if d.get("drugbank_id"):
            brands[d["drugbank_id"]].update(d.get("brand_names") or [])

    drug_ids = set(tdc.ID1) | set(tdc.ID2)
    chosen, others = pick_names(drug_ids, kb_drugs, args.kpaths, args.ayvaz, pubchem)
    drugs = build_drugs(tdc, chosen, others, brands, pubchem)
    interactions = build_interactions(tdc, drugs, pd.read_parquet(args.severity))
    check(drugs, interactions)

    os.makedirs(args.out, exist_ok=True)
    drugs.to_parquet(os.path.join(args.out, "drugs.parquet"), index=False)
    interactions.to_parquet(os.path.join(args.out, "known_interactions.parquet"), index=False)

    print(f"drugs: {len(drugs):,} (name from {drugs.name_source.value_counts().to_dict()})")
    print(f"  with synonyms: {(drugs.synonyms.str.len() > 0).sum():,}; usable for ML: {drugs.supported_for_ml.sum():,}")
    print(f"known_interactions: {len(interactions):,} rows over {interactions.pair_key.nunique():,} pairs")
    print("  severity:", interactions.drop_duplicates("pair_key").severity_display.value_counts().to_dict())
    print("checks passed")


if __name__ == "__main__":
    main()
