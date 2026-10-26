import argparse
import os

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator

RDLogger.DisableLog("rdApp.*")

RADIUS = 2
BITS = 2048


def fingerprints(smiles):
    generator = rdFingerprintGenerator.GetMorganGenerator(radius=RADIUS, fpSize=BITS)
    return np.stack([generator.GetFingerprintAsNumPy(Chem.MolFromSmiles(s)) for s in smiles])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--drugs", default="data/processed/drugs.parquet")
    parser.add_argument("--out", default="data/processed/node_features.npz")
    args = parser.parse_args()

    drugs = pd.read_parquet(args.drugs)
    usable = drugs[drugs.supported_for_ml].sort_values("drug_id")
    x = fingerprints(usable.smiles).astype(np.float32)
    drug_ids = usable.drug_id.to_numpy(dtype=str)

    if len(drug_ids) != len(set(drug_ids)) or x.shape != (len(usable), BITS):
        raise ValueError("feature matrix and drug_ids are out of line")
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    np.savez_compressed(args.out, X=x, drug_ids=drug_ids)

    left_out = drugs.loc[~drugs.supported_for_ml, "drugbank_id"].tolist()
    same = len(x) - len(np.unique(x, axis=0))
    print(f"X: {x.shape[0]:,} drugs x {x.shape[1]} bits -> {args.out}")
    print(f"bits set per drug: median {np.median(x.sum(1)):.0f}, min {x.sum(1).min():.0f}, max {x.sum(1).max():.0f}")
    print(f"drugs sharing a fingerprint with another drug: {same}")
    print(f"left out (SMILES doesn't parse): {left_out}")


if __name__ == "__main__":
    main()
