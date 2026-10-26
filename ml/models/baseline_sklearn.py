import argparse
import json
import os

import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, f1_score, roc_auc_score

SEED = 42


def pair_features(x, pairs):
    return sparse.hstack([x[pairs[:, 0]], x[pairs[:, 1]]], format="csr")


def part(split, x, name):
    pos, neg = split[f"{name}_pos"], split[f"{name}_neg"]
    pairs = np.concatenate([pos, neg])
    y = np.concatenate([np.ones(len(pos)), np.zeros(len(neg))])
    return pair_features(x, pairs), y


def scores(y, p):
    return {"auroc": round(roc_auc_score(y, p), 4), "aupr": round(average_precision_score(y, p), 4),
            "f1_at_0.5": round(f1_score(y, p >= 0.5), 4), "pairs": int(len(y))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="data/processed/node_features.npz")
    parser.add_argument("--split", default="data/processed/edge_split.npz")
    parser.add_argument("--out", default="ml/experiments/baseline_metrics.json")
    args = parser.parse_args()

    x = sparse.csr_matrix(np.load(args.features)["X"])
    split = np.load(args.split)
    x_train, y_train = part(split, x, "train")

    model = LogisticRegression(C=1.0, max_iter=2000, solver="liblinear", random_state=SEED)
    model.fit(x_train, y_train)

    rng = np.random.default_rng(SEED)
    result = {"model": "logistic regression on [x_u || x_v], Morgan r=2, 2048 bits", "seed": SEED}
    for name in ("val", "test"):
        features, y = part(split, x, name)
        result[name] = scores(y, model.predict_proba(features)[:, 1])
        result[f"{name}_random"] = scores(y, rng.random(len(y)))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
