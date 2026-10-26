import argparse
import json
import os

import pandas as pd

from ml.pipelines import pubchem

MAX_SYNONYMS = 60


def cid_for(drugbank_id):
    js = pubchem.request(f"compound/xref/RegistryID/{drugbank_id}/cids/JSON")
    cids = (js or {}).get("IdentifierList", {}).get("CID", [])
    return cids[0] if cids else None


def names_for(cids):
    ids = ",".join(str(c) for c in cids)
    titles, synonyms = {}, {}
    js = pubchem.request("compound/cid/property/Title/JSON", data={"cid": ids})
    for p in (js or {}).get("PropertyTable", {}).get("Properties", []):
        titles[p["CID"]] = p.get("Title")
    js = pubchem.request("compound/cid/synonyms/JSON", data={"cid": ids})
    for info in (js or {}).get("InformationList", {}).get("Information", []):
        synonyms[info["CID"]] = info.get("Synonym", [])[:MAX_SYNONYMS]
    return titles, synonyms


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tdc", default="data/raw/tdc_ddi_drugbank.tab")
    parser.add_argument("--out", default="data/raw/pubchem_drugs.json")
    args = parser.parse_args()

    tdc = pd.read_csv(args.tdc, sep="\t", usecols=["ID1", "ID2"])
    drug_ids = sorted(set(tdc.ID1) | set(tdc.ID2))

    cache = {}
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as f:
            cache = json.load(f)

    def save():
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)

    todo = [d for d in drug_ids if d not in cache]
    print(f"{len(drug_ids)} drugs, {len(todo)} to look up", flush=True)
    try:
        for i, d in enumerate(todo, 1):
            cache[d] = {"cid": cid_for(d)}
            if i % 100 == 0:
                print(f"  cids {i}/{len(todo)}", flush=True)
                save()

        need_names = [d for d in drug_ids if cache[d]["cid"] and "title" not in cache[d]]
        for start in range(0, len(need_names), 100):
            batch = need_names[start:start + 100]
            titles, synonyms = names_for([cache[d]["cid"] for d in batch])
            for d in batch:
                cid = cache[d]["cid"]
                cache[d]["title"] = titles.get(cid)
                cache[d]["synonyms"] = synonyms.get(cid, [])
    except pubchem.Throttled:
        save()
        print("PubChem is throttling us. Progress saved; run the same command again later.")
        return

    save()

    found = sum(1 for d in drug_ids if cache[d]["cid"])
    named = sum(1 for d in drug_ids if cache[d].get("title"))
    print(f"CID found for {found}/{len(drug_ids)}, named {named} -> {args.out}")


if __name__ == "__main__":
    main()
