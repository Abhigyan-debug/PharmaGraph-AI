import argparse
import os

import numpy as np
import torch
from torch_geometric.data import Data
from torch_geometric.utils import is_undirected, to_undirected

from ml.graph.split_edges import positive_pairs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="data/processed/node_features.npz")
    parser.add_argument("--interactions", default="data/processed/known_interactions.parquet")
    parser.add_argument("--out", default="data/processed/pharmgraph.pt")
    args = parser.parse_args()

    features = np.load(args.features)
    drug_ids = features["drug_ids"].tolist()
    pairs, dropped = positive_pairs(args.interactions, features["drug_ids"])

    edge_index = to_undirected(torch.from_numpy(pairs.T.copy()).long(), num_nodes=len(drug_ids))
    graph = Data(x=torch.from_numpy(features["X"]), edge_index=edge_index, drug_ids=drug_ids)

    if graph.edge_index.size(1) != 2 * len(pairs) or not is_undirected(graph.edge_index):
        raise ValueError("edge_index is not one undirected edge per pair")
    if graph.has_self_loops() or graph.num_nodes != len(drug_ids):
        raise ValueError("graph has self loops or the node count is off")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    torch.save(graph, args.out)
    degree = torch.bincount(graph.edge_index[0], minlength=graph.num_nodes)
    print(graph)
    print(f"{graph.num_nodes:,} drugs, {len(pairs):,} interacting pairs -> {args.out}")
    print(f"degree: median {degree.median().item()}, max {degree.max().item()}, "
          f"drugs with no edge {(degree == 0).sum().item()}; pairs dropped (drug has no features): {dropped}")


if __name__ == "__main__":
    main()
