import argparse
import json
import os

import numpy as np
import pandas as pd

SEED = 42
FRACTIONS = {"train": 0.70, "val": 0.15, "test": 0.15}


def positive_pairs(interactions_path, drug_ids):
    row = {d: i for i, d in enumerate(drug_ids)}
    pairs = pd.read_parquet(interactions_path, columns=["drug_a_id", "drug_b_id"]).drop_duplicates()
    keep = pairs.drug_a_id.isin(row) & pairs.drug_b_id.isin(row)
    u = pairs.drug_a_id[keep].map(row).to_numpy()
    v = pairs.drug_b_id[keep].map(row).to_numpy()
    return np.stack([np.minimum(u, v), np.maximum(u, v)], axis=1), int((~keep).sum())


def sample_negatives(n_nodes, how_many, forbidden, rng):
    found = set()
    while len(found) < how_many:
        u = rng.integers(0, n_nodes, size=how_many)
        v = rng.integers(0, n_nodes, size=how_many)
        for a, b in zip(np.minimum(u, v), np.maximum(u, v)):
            if a != b and (a, b) not in forbidden and (a, b) not in found:
                found.add((int(a), int(b)))
                if len(found) == how_many:
                    break
    return np.array(sorted(found), dtype=np.int64)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="data/processed/node_features.npz")
    parser.add_argument("--interactions", default="data/processed/known_interactions.parquet")
    parser.add_argument("--out", default="data/processed/edge_split.npz")
    args = parser.parse_args()

    drug_ids = np.load(args.features)["drug_ids"]
    pos, dropped = positive_pairs(args.interactions, drug_ids)
    rng = np.random.default_rng(SEED)
    pos = pos[rng.permutation(len(pos))]

    n_train = int(len(pos) * FRACTIONS["train"])
    n_val = int(len(pos) * FRACTIONS["val"])
    split = {"train_pos": pos[:n_train], "val_pos": pos[n_train:n_train + n_val],
             "test_pos": pos[n_train + n_val:]}

    forbidden = set(map(tuple, pos.tolist()))
    for name in ("train", "val", "test"):
        neg = sample_negatives(len(drug_ids), len(split[f"{name}_pos"]), forbidden, rng)
        forbidden |= set(map(tuple, neg.tolist()))
        split[f"{name}_neg"] = neg

    sets = {k: set(map(tuple, a.tolist())) for k, a in split.items()}
    for a in sets:
        for b in sets:
            if a < b and sets[a] & sets[b]:
                raise ValueError(f"{a} and {b} share pairs")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    np.savez_compressed(args.out, **split)
    print(json.dumps({k: len(a) for k, a in split.items()}))
    print(f"seed {SEED}; pairs dropped because a drug has no features: {dropped}; no pair in two parts")


if __name__ == "__main__":
    main()
