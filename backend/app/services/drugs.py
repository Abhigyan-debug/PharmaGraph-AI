import unicodedata

from sqlalchemy import text

SEARCH_LIMIT = 20
TYPO_THRESHOLD = 0.4

SEARCH_SQL = text("""
    SELECT drug_id, name
    FROM (
        SELECT drug_id, name,
               name_normalized LIKE :prefix
                   OR EXISTS (SELECT 1 FROM unnest(synonyms) s WHERE lower(s) LIKE :prefix) AS prefix_hit,
               GREATEST(similarity(name_normalized, :q),
                        COALESCE((SELECT max(similarity(lower(s), :q)) FROM unnest(synonyms) s), 0)) AS score
        FROM drugs
        WHERE supported
    ) ranked
    WHERE prefix_hit OR score > :threshold
    ORDER BY prefix_hit DESC, score DESC, name
    LIMIT :limit
""")


def normalize(q):
    return " ".join(unicodedata.normalize("NFKC", q).split()).lower()


def search_drugs(db, q):
    q = normalize(q)
    prefix = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    rows = db.execute(SEARCH_SQL, {"q": q, "prefix": prefix,
                                   "threshold": TYPO_THRESHOLD, "limit": SEARCH_LIMIT})
    return [{"id": r.drug_id, "name": r.name} for r in rows]
