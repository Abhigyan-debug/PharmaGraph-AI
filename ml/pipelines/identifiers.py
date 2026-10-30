import argparse
import json
import os

import pandas as pd
from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")


def inchi_pair(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None, None
    return Chem.MolToInchi(mol) or None, Chem.MolToInchiKey(mol) or None


def ids_by(frame, key, value):
    return frame.groupby(key)[value].agg(lambda ids: sorted(set(ids))).to_dict()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--drugs", default="data/processed/drugs.parquet")
    parser.add_argument("--ddinter-map", default="data/raw/ddinter_to_drugbank_map.csv")
    parser.add_argument("--kegg-conv", default="data/raw/kegg_cache/conv_drug_pubchem.tsv")
    parser.add_argument("--kegg-sid-cid", default="data/raw/kegg_cache/sid_cid.json")
    parser.add_argument("--out", default="data/processed/identifiers.parquet")
    args = parser.parse_args()

    drugs = pd.read_parquet(args.drugs)

    # DDInter sometimes has several entries for one DrugBank drug (e.g. different salts), so ids are lists.
    ddinter = ids_by(pd.read_csv(args.ddinter_map), "drugbank_id", "ddinter_id")

    # KEGG links its drugs to PubChem substance ids (SIDs); sid_cid.json turns those into compound ids (CIDs).
    sid_cid = json.load(open(args.kegg_sid_cid))
    kegg = pd.read_csv(args.kegg_conv, sep="\t", header=None, names=["kegg", "sid"])
    kegg["cid"] = kegg.sid.str.removeprefix("pubchem:").map(lambda sid: str(sid_cid[sid]) if sid in sid_cid else None)
    kegg["kegg"] = kegg.kegg.str.removeprefix("dr:")
    kegg_by_cid = ids_by(kegg.dropna(subset=["cid"]), "cid", "kegg")

    out = pd.DataFrame({"drug_id": drugs.drug_id})
    out["ddinter_ids"] = drugs.drugbank_id.map(ddinter)
    out["kegg_ids"] = drugs.pubchem_cid.map(kegg_by_cid)
    out[["inchi", "inchikey"]] = pd.DataFrame(drugs.smiles.map(inchi_pair).tolist(), index=drugs.index)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    out.to_parquet(args.out, index=False)
    print(f"{len(out):,} drugs -> {args.out}")
    for column in ["ddinter_ids", "kegg_ids", "inchikey"]:
        print(f"  {column}: {out[column].notna().sum():,}")


if __name__ == "__main__":
    main()
