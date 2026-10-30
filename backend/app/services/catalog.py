from fastapi import HTTPException
from sqlalchemy import func, select, text

from app.models.tables import Drug, KnownInteraction
from app.services.drugs import normalize
from app.services.severity import is_contraindicated
from app.services.structure import thumbnail_svg

PAGE_SIZE = 24
SEVERITY_ORDER = ["major", "moderate", "minor", "unknown"]

# One row per partner drug: the worst severity of any interaction row for that pair.
PARTNERS_SQL = text("""
    SELECT partner_id, d.name, ki.severity, ki.description, ki.contraindicated
    FROM (
        SELECT DISTINCT ON (partner_id) partner_id, severity_display AS severity, description,
               severity_raw AS contraindicated, rank
        FROM (
            SELECT CASE WHEN drug_a_id = :id THEN drug_b_id ELSE drug_a_id END AS partner_id,
                   severity_display, description, severity_raw,
                   array_position(ARRAY['major','moderate','minor','unknown'], severity_display) AS rank
            FROM known_interactions
            WHERE drug_a_id = :id OR drug_b_id = :id
        ) rows
        ORDER BY partner_id, rank
    ) ki
    JOIN drugs d ON d.drug_id = ki.partner_id
    ORDER BY ki.rank, d.name
""")


def interaction_counts(db, drug_ids):
    pairs = (select(KnownInteraction.drug_a_id.label("drug_id"), KnownInteraction.pair_key)
             .where(KnownInteraction.drug_a_id.in_(drug_ids))
             .union(select(KnownInteraction.drug_b_id, KnownInteraction.pair_key)
                    .where(KnownInteraction.drug_b_id.in_(drug_ids)))).subquery()
    return dict(db.execute(select(pairs.c.drug_id, func.count()).group_by(pairs.c.drug_id)).all())


def list_drugs(db, page, q=None):
    query = select(Drug).where(Drug.supported)
    if q:
        query = query.where(Drug.name_normalized.contains(normalize(q), autoescape=True))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    drugs = db.scalars(query.order_by(Drug.name_normalized).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)).all()
    counts = interaction_counts(db, [d.drug_id for d in drugs])
    return {
        "total": total,
        "page": page,
        "page_size": PAGE_SIZE,
        "drugs": [{"id": d.drug_id, "name": d.name, "drugbank_id": d.drugbank_id, "smiles": d.smiles,
                   "has_3d": d.molblock is not None, "interactions": counts.get(d.drug_id, 0),
                   "thumbnail": thumbnail_svg(d.smiles)} for d in drugs],
    }


def drug_detail(db, drug_id):
    drug = db.get(Drug, drug_id)
    if drug is None or not drug.supported:
        raise HTTPException(status_code=404, detail={"error": "drug_not_found", "detail": drug_id})
    partners = db.execute(PARTNERS_SQL, {"id": drug_id}).all()
    by_severity = {level: 0 for level in SEVERITY_ORDER}
    for partner in partners:
        by_severity[partner.severity] += 1
    return {
        "id": drug.drug_id,
        "name": drug.name,
        "description": drug.description,
        "mesh_id": drug.mesh_id,
        "synonyms": drug.synonyms[:12],
        "smiles": drug.smiles,
        "inchi": drug.inchi,
        "inchikey": drug.inchikey,
        "identifiers": {"drugbank": [drug.drugbank_id] if drug.drugbank_id else [],
                        "pubchem": [drug.pubchem_cid] if drug.pubchem_cid else [],
                        "ddinter": drug.ddinter_ids or [], "kegg": drug.kegg_ids or []},
        "interaction_total": len(partners),
        "by_severity": by_severity,
        "partners": [{"id": p.partner_id, "name": p.name, "severity": p.severity, "description": p.description,
                      "contraindicated": is_contraindicated(p.contraindicated)} for p in partners],
    }


_stats = {}


# shortcut: cached for the life of the process; restart the API after reseeding to refresh it.
def stats(db):
    if not _stats:
        row = db.execute(text("""
            SELECT (SELECT count(*) FROM drugs WHERE supported) AS drugs,
                   (SELECT count(DISTINCT pair_key) FROM known_interactions) AS pairs,
                   (SELECT count(DISTINCT pair_key) FROM known_interactions WHERE severity_display <> 'unknown') AS graded,
                   (SELECT count(molblock) FROM drugs WHERE supported) AS with_3d,
                   (SELECT count(drugbank_id) FROM drugs WHERE supported) AS drugbank,
                   (SELECT count(pubchem_cid) FROM drugs WHERE supported) AS pubchem,
                   (SELECT count(ddinter_ids) FROM drugs WHERE supported) AS ddinter,
                   (SELECT count(kegg_ids) FROM drugs WHERE supported) AS kegg,
                   (SELECT count(inchikey) FROM drugs WHERE supported) AS inchikey
        """)).one()._asdict()
        severity = dict(db.execute(text("""
            SELECT severity_display, count(DISTINCT pair_key) FROM known_interactions GROUP BY severity_display
        """)).all())
        _stats.update(row, severity={level: severity.get(level, 0) for level in SEVERITY_ORDER})
    return _stats
