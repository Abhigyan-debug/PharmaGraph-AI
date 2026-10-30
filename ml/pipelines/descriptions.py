import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request

import pandas as pd

SPARQL = "https://id.nlm.nih.gov/mesh/sparql"
BATCH = 40
SYNONYMS_TRIED = 8
PAUSE_S = 1.0  # be gentle with NLM's public endpoint

# A descriptor's definition is its preferred concept's scope note; a supplementary chemical record
# (newer drugs) has a plain note instead.
QUERY = """PREFIX meshv: <http://id.nlm.nih.gov/mesh/vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?label ?rec ?note WHERE {{
  VALUES ?label {{ {values} }}
  ?rec rdfs:label ?label .
  {{ ?rec meshv:preferredConcept ?c . ?c meshv:scopeNote ?note . }}
  UNION {{ ?rec a meshv:SCR_Chemical ; meshv:note ?note . }}
}}"""


def variants(name):
    # MeSH writes descriptors "Warfarin" and many chemical records "abemaciclib"; labels must match exactly.
    return {name, name.lower(), name[:1].upper() + name[1:].lower()}


def lookup(labels, cache):
    """MeSH id and note for every label MeSH knows; asks MeSH only about labels not in the cache."""
    labels = sorted(set(labels) - set(cache))
    for start in range(0, len(labels), BATCH):
        values = " ".join(json.dumps(label) + "@en" for label in labels[start:start + BATCH])
        url = SPARQL + "?" + urllib.parse.urlencode({"query": QUERY.format(values=values), "format": "JSON", "limit": 1000})
        for attempt in range(3):
            try:
                rows = json.load(urllib.request.urlopen(url, timeout=120))["results"]["bindings"]
                break
            except Exception as error:  # the endpoint sometimes drops a long response; try again
                if attempt == 2:
                    raise
                print(f"  retrying batch {start // BATCH + 1}: {error}")
                time.sleep(5)
        for label in labels[start:start + BATCH]:
            cache.setdefault(label, None)  # asked and not found: don't ask again
        for row in rows:
            if cache.get(row["label"]["value"]) is None:
                cache[row["label"]["value"]] = (row["rec"]["value"].rsplit("/", 1)[1], row["note"]["value"])
        time.sleep(PAUSE_S)
    return {label: hit for label, hit in cache.items() if hit}


def clean(note):
    # MeSH capitalises words that are other MeSH headings ("HISTONE DEACETYLASE"); keep short acronyms like DNA, HIV.
    text = re.sub(r"\b[A-Z][A-Z-]{4,}\b", lambda m: m.group(0).lower(), note)
    return " ".join(text.split())


def first_match(names, found):
    for name in names:
        for variant in variants(name):
            if variant in found:
                return found[variant]
    return None, None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--drugs", default="data/processed/drugs.parquet")
    parser.add_argument("--pubchem", default="data/raw/pubchem_drugs.json")
    parser.add_argument("--cache", default="data/raw/mesh_cache.json")
    parser.add_argument("--out", default="data/processed/descriptions.parquet")
    args = parser.parse_args()

    drugs = pd.read_parquet(args.drugs)
    pubchem_titles = {db: record.get("title") for db, record in json.load(open(args.pubchem, encoding="utf-8")).items()}
    cache = {k: tuple(v) if v else None for k, v in json.load(open(args.cache)).items()} if os.path.exists(args.cache) else {}

    # Names to try, best first: ours, PubChem's title ("Acetylsalicylic acid" is "Aspirin" there and in MeSH),
    # then synonyms. Our synonyms are mostly brand names, so they come last.
    candidates = [[name, pubchem_titles.get(db), *list(synonyms)[:SYNONYMS_TRIED]]
                  for name, db, synonyms in zip(drugs.name, drugs.drugbank_id, drugs.synonyms)]
    candidates = [[c for c in names if c] for names in candidates]

    found = lookup({v for names in candidates for v in variants(names[0])}, cache)
    missing = [names for names in candidates if first_match(names[:1], found)[0] is None]
    found = lookup({v for names in missing for c in names[1:] for v in variants(c)}, cache)

    with open(args.cache, "w") as f:
        json.dump(cache, f)

    rows = []
    for names in candidates:
        mesh_id, note = first_match(names, found)
        rows.append((mesh_id, clean(note) if note else None))
    out = pd.DataFrame(rows, columns=["mesh_id", "description"])
    out.insert(0, "drug_id", drugs.drug_id.to_numpy())

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    out.to_parquet(args.out, index=False)
    print(f"{len(out):,} drugs -> {args.out}")
    print(f"  with a MeSH description: {out.description.notna().sum():,}")


if __name__ == "__main__":
    main()
