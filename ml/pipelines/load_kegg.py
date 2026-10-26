"""Pull DDI severity labels for our drugs from the live KEGG DDI API.

KEGG's DDI data comes from Japanese package inserts and has two labels:
CI (contraindicated) and P (precaution). Free for academic use through the
API; redistribution isn't allowed, so the output stays in data/raw/ (gitignored).

KEGG entries don't link to DrugBank any more, so we match by structure:
    KEGG drug -> PubChem SID (KEGG's own conv list) -> CID -> SMILES
    TDC drug  -> SMILES (already in the TDC file)
and compare the first block of the InChIKey of the largest fragment. Taking
the largest fragment drops counter-ions, so KEGG's "warfarin sodium" (D00564)
matches TDC's warfarin. The first InChIKey block ignores stereo and
protonation, so this is a connectivity match, not an exact one.

Structures come from PubChem because it answers in batches of hundreds; KEGG's
own MOL endpoint takes ten entries per call and was too slow for 12,000 drugs.
KEGG is only asked for the DDI lists, one drug per call.

Everything is cached in data/raw/kegg_cache/, so a rerun only asks for what's missing.

Usage:
    python -m ml.pipelines.load_kegg --out data/raw/kegg_severity.parquet
"""

import argparse
import json
import os
import time
from collections import defaultdict

import pandas as pd
import requests
from rdkit import Chem, RDLogger

from ml.pipelines import pubchem

RDLogger.DisableLog("rdApp.*")

KEGG = "https://rest.kegg.jp"
KEGG_PAUSE = 0.4  # KEGG publishes no limit; this keeps us under ~2 requests/second


class Refused(Exception):
    """KEGG kept refusing; stop rather than cache a wrong answer."""


def kegg_get(path, tries=5):
    for attempt in range(tries):
        time.sleep(KEGG_PAUSE)
        try:
            r = requests.get(f"{KEGG}/{path}", timeout=120)
        except requests.RequestException:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 200:
            return r.text
        if r.status_code == 404:
            return ""
        wait = 30 * (attempt + 1)
        print(f"  KEGG {r.status_code}, waiting {wait}s", flush=True)
        time.sleep(wait)
    raise Refused(path)


def load_cache(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(path, cache):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f)


def kegg_to_sid(kind, cache_dir):
    """{'D00564': 7847631, ...} from KEGG's conv list, fetched once."""
    path = os.path.join(cache_dir, f"conv_{kind}_pubchem.tsv")
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f:
            f.write(kegg_get(f"conv/pubchem/{kind}"))
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            k, sid = line.strip().split("\t")
            out[k.split(":")[1]] = int(sid.split(":")[1])
    return out


def sids_to_smiles(sids, cache_dir):
    """SID -> SMILES of its standardised compound, None when PubChem has no structure."""
    cid_path = os.path.join(cache_dir, "sid_cid.json")
    smi_path = os.path.join(cache_dir, "cid_smiles.json")
    sid_cid, cid_smi = load_cache(cid_path), load_cache(smi_path)

    todo = [s for s in sids if str(s) not in sid_cid]
    for start in range(0, len(todo), 500):
        batch = todo[start:start + 500]
        js = pubchem.request("substance/sid/cids/JSON", data={"sid": ",".join(map(str, batch))})
        for row in (js or {}).get("InformationList", {}).get("Information", []):
            cids = row.get("CID", [])
            sid_cid[str(row["SID"])] = cids[0] if cids else None
        for s in batch:
            sid_cid.setdefault(str(s), None)  # PubChem answered but had no compound for it
        save_cache(cid_path, sid_cid)
        print(f"  sid->cid {min(start + 500, len(todo))}/{len(todo)}", flush=True)

    cids = sorted({c for s in sids if (c := sid_cid.get(str(s)))})
    todo = [c for c in cids if str(c) not in cid_smi]
    for start in range(0, len(todo), 300):
        batch = todo[start:start + 300]
        js = pubchem.request("compound/cid/property/SMILES/JSON", data={"cid": ",".join(map(str, batch))})
        for p in (js or {}).get("PropertyTable", {}).get("Properties", []):
            cid_smi[str(p["CID"])] = p.get("SMILES")
        for c in batch:
            cid_smi.setdefault(str(c), None)
        save_cache(smi_path, cid_smi)
        print(f"  cid->smiles {min(start + 300, len(todo))}/{len(todo)}", flush=True)

    return {s: cid_smi.get(str(sid_cid.get(str(s)))) for s in sids}


def structure_key(smiles):
    """First InChIKey block of the largest fragment, or None."""
    mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
    if mol is None:
        return None
    frags = Chem.GetMolFrags(mol, asMols=True)
    main = max(frags, key=lambda m: m.GetNumHeavyAtoms())
    if main.GetNumHeavyAtoms() < 2:  # water, ions, single atoms: too ambiguous
        return None
    key = Chem.MolToInchiKey(main)
    return key[:14] if key else None


def map_entries(entry_sid, cache_dir, key_to_db):
    smiles = sids_to_smiles(list(entry_sid.values()), cache_dir)
    out = {}
    for entry, sid in entry_sid.items():
        k = structure_key(smiles.get(sid))
        if k in key_to_db:
            out[entry] = key_to_db[k]
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tdc", default="data/raw/tdc_ddi_drugbank.tab")
    parser.add_argument("--cache-dir", default="data/raw/kegg_cache")
    parser.add_argument("--out", default="data/raw/kegg_severity.parquet")
    args = parser.parse_args()
    os.makedirs(args.cache_dir, exist_ok=True)
    ddi_path = os.path.join(args.cache_dir, "ddi.json")

    # structure key -> DrugBank ID, from TDC's own SMILES
    tdc = pd.read_csv(args.tdc, sep="\t", usecols=["ID1", "ID2", "X1", "X2"])
    tdc_smiles = dict(zip(tdc.ID1, tdc.X1)) | dict(zip(tdc.ID2, tdc.X2))
    keys = defaultdict(set)
    for db, smi in tdc_smiles.items():
        k = structure_key(smi)
        if k:
            keys[k].add(db)
    shared = {k for k, dbs in keys.items() if len(dbs) > 1}
    key_to_db = {k: next(iter(dbs)) for k, dbs in keys.items() if k not in shared}
    print(f"TDC drugs with a usable structure key: {len(key_to_db)}/{len(tdc_smiles)} "
          f"({len(shared)} keys shared by several DrugBank IDs, skipped)")

    try:
        drug_sid = kegg_to_sid("drug", args.cache_dir)
        kegg_to_db = map_entries(drug_sid, args.cache_dir, key_to_db)
        mapped = sorted(kegg_to_db)
        print(f"KEGG drugs: {len(drug_sid)}; mapped to a TDC drug: {len(mapped)}, "
              f"covering {len(set(kegg_to_db.values()))} DrugBank IDs", flush=True)

        ddi = load_cache(ddi_path)
        todo = [d for d in mapped if d not in ddi]
        print(f"fetching DDI lists for {len(todo)} KEGG drugs", flush=True)
        for i, d in enumerate(todo, 1):
            ddi[d] = kegg_get(f"ddi/{d}")
            if i % 25 == 0:
                save_cache(ddi_path, ddi)
                print(f"  ddi {i}/{len(todo)}", flush=True)
        save_cache(ddi_path, ddi)

        # A few partners are KEGG compounds (cpd:C...) rather than drugs; they
        # include real drugs such as kanamycin and argatroban, so map them too.
        partner_cpds = {line.split("\t")[1].split(":")[-1]
                        for d in mapped for line in ddi.get(d, "").splitlines()
                        if "\tcpd:" in line}
        cpd_sid = {c: s for c, s in kegg_to_sid("compound", args.cache_dir).items() if c in partner_cpds}
        kegg_to_db |= map_entries(cpd_sid, args.cache_dir, key_to_db)
    except (Refused, pubchem.Throttled) as e:
        print(f"Stopped: {e!r}. Progress is cached; run the same command again later.")
        return

    rows = []
    for d in mapped:
        for line in ddi.get(d, "").splitlines():
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            a = kegg_to_db.get(parts[0].split(":")[-1])
            b = kegg_to_db.get(parts[1].split(":")[-1])
            if not (a and b) or a == b:
                continue
            labels = set(parts[2].split(","))
            if "CI" in labels:
                severity = "major"
            elif "P" in labels:
                severity = "moderate"  # broad "precaution" bucket, see docs/decisions.md
            else:
                continue
            a, b = sorted([a, b])
            rows.append({"pair_key": f"{a}__{b}", "drugbank_id_a": a, "drugbank_id_b": b,
                         "source": "KEGG", "severity_raw": parts[2], "severity": severity})

    df = pd.DataFrame(rows).drop_duplicates(["pair_key", "severity_raw"])
    df.to_parquet(args.out, index=False)
    print(f"wrote {len(df):,} rows, {df.pair_key.nunique():,} pairs -> {args.out}")
    print(df.severity_raw.value_counts().to_string())


if __name__ == "__main__":
    main()
