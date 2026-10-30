import argparse
import os
import time
from multiprocessing import Pool
from multiprocessing import TimeoutError as PoolTimeout

import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem

RDLogger.DisableLog("rdApp.*")

MAX_HEAVY_ATOMS = 60
MAX_ATTEMPTS = 20
SEED = 42
TIMEOUT_S = 60


def embed(mol, enforce_chirality):
    params = AllChem.ETKDGv3()
    params.randomSeed = SEED
    # Caps retries on molecules whose stereo tags ETKDG can't satisfy.
    params.maxIterations = MAX_ATTEMPTS
    params.enforceChirality = enforce_chirality
    return AllChem.EmbedMolecule(mol, params) == 0


def conformer(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None, "The SMILES string doesn't parse; no 3D model."
    heavy_atoms = mol.GetNumHeavyAtoms()
    if heavy_atoms > MAX_HEAVY_ATOMS:
        return None, f"{heavy_atoms} heavy atoms is too large for a readable 3D model; showing 2D only."
    mol = Chem.AddHs(mol)
    note = None
    if not embed(mol, enforce_chirality=True):
        if not embed(mol, enforce_chirality=False):
            return None, "RDKit could not build 3D coordinates for this molecule; showing 2D only."
        note = "Stereochemistry could not be enforced in this 3D model; the 2D drawing shows it."
    AllChem.MMFFOptimizeMolecule(mol)
    return Chem.MolToMolBlock(mol), note


def build_all(names, smiles):
    # A Pool can't stop one task, so on a hang the whole pool is killed (leaving `with`) and restarted
    # after the stuck molecule. maxIterations alone didn't stop every hang.
    results = []
    while len(results) < len(smiles):
        with Pool() as pool:
            pending = pool.imap(conformer, smiles[len(results):])
            try:
                while len(results) < len(smiles):
                    results.append(pending.next(timeout=TIMEOUT_S))
                    if len(results) % 200 == 0:
                        print(f"  {len(results):,} / {len(smiles):,}", flush=True)
            except PoolTimeout:
                print(f"  gave up on {names[len(results)]} after {TIMEOUT_S} s", flush=True)
                results.append((None, f"RDKit took over {TIMEOUT_S} s to build 3D coordinates; showing 2D only."))
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--drugs", default="data/processed/drugs.parquet")
    parser.add_argument("--out", default="data/processed/conformers.parquet")
    args = parser.parse_args()

    drugs = pd.read_parquet(args.drugs)
    start = time.time()
    results = build_all(drugs.name.tolist(), drugs.smiles.tolist())
    out =pd.DataFrame(results, columns=["molblock", "conformer_note"])
    out.insert(0, "drug_id", drugs.drug_id.to_numpy())

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    out.to_parquet(args.out, index=False)

    has_3d = out.molblock.notna()
    relaxed = has_3d & out.conformer_note.notna()
    print(f"{len(out):,} drugs in {time.time() - start:.0f} s -> {args.out}")
    print(f"3D model: {has_3d.sum():,} (stereo not enforced: {relaxed.sum()})")
    print(f"2D only: {(~has_3d).sum():,}")
    print(out.loc[~has_3d, "conformer_note"].str.split(";").str[0].str.replace(r"^\d+", "N", regex=True)
          .value_counts().to_string())


if __name__ == "__main__":
    main()
