from itertools import combinations

from fastapi import HTTPException
from sqlalchemy import select

from app.models.tables import Drug, KnownInteraction
from app.services.severity import is_contraindicated


def known_interactions(db, drug_ids):
    drugs = db.scalars(select(Drug).where(Drug.drug_id.in_(drug_ids), Drug.supported)).all()
    unknown = sorted(set(drug_ids) - {d.drug_id for d in drugs})
    if unknown:
        raise HTTPException(status_code=422, detail={"error": "unknown_drug_ids", "detail": unknown})

    pairs = list(combinations(sorted(drug_ids), 2))
    keys = [f"{a}__{b}" for a, b in pairs]
    rows = db.scalars(select(KnownInteraction)
                      .where(KnownInteraction.pair_key.in_(keys))
                      .order_by(KnownInteraction.pair_key, KnownInteraction.interaction_type)).all()
    with_record = {r.pair_key for r in rows}

    by_id = {d.drug_id: d for d in drugs}
    return {
        "drugs": [{"id": i, "name": by_id[i].name} for i in drug_ids],
        "pairs_checked": len(pairs),
        "interactions": [{
            "interaction_id": r.interaction_id,
            "pair": (r.drug_a_id, r.drug_b_id),
            "interaction_type": r.interaction_type,
            "description": r.description,
            "severity": r.severity_display,
            "contraindicated": is_contraindicated(r.severity_raw),
            "severity_raw": r.severity_raw,
            "severity_sources": r.severity_sources,
            "source": r.source,
        } for r in rows],
        "pairs_without_record": [p for p, k in zip(pairs, keys) if k not in with_record],
    }
