import re
import unicodedata

from sqlalchemy import text

SEARCH_LIMIT = 20
TYPO_THRESHOLD = 0.4

# `matched`: the synonym that found the drug when its own name didn't.
SEARCH_SQL = text("""
    SELECT drug_id, name, description, matched
    FROM (
        SELECT drug_id, name, description,
               name_normalized LIKE :prefix AS name_prefix,
               name_normalized LIKE :prefix
                   OR EXISTS (SELECT 1 FROM unnest(synonyms) s WHERE lower(s) LIKE :prefix) AS prefix_hit,
               GREATEST(similarity(name_normalized, :q),
                        COALESCE((SELECT max(similarity(lower(s), :q)) FROM unnest(synonyms) s), 0)) AS score,
               CASE WHEN name_normalized LIKE :prefix
                         OR (NOT COALESCE(best.syn_prefix, false)
                             AND similarity(name_normalized, :q) >= COALESCE(best.syn_score, 0))
                    THEN NULL ELSE best.synonym END AS matched
        FROM drugs
        LEFT JOIN LATERAL (
            SELECT s AS synonym, lower(s) LIKE :prefix AS syn_prefix, similarity(lower(s), :q) AS syn_score
            FROM unnest(synonyms) s
            ORDER BY lower(s) LIKE :prefix DESC, similarity(lower(s), :q) DESC
            LIMIT 1
        ) best ON true
        WHERE supported
    ) ranked
    WHERE prefix_hit OR score > :threshold
    ORDER BY name_prefix DESC, prefix_hit DESC, score DESC, name
    LIMIT :limit
""")


def normalize(q):
    return " ".join(unicodedata.normalize("NFKC", q).split()).lower()


def search_drugs(db, q):
    q = normalize(q)
    prefix = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    rows = db.execute(SEARCH_SQL, {"q": q, "prefix": prefix,
                                   "threshold": TYPO_THRESHOLD, "limit": SEARCH_LIMIT})
    return [{"id": r.drug_id, "name": r.name, "summary": first_sentence(r.description), "matched": r.matched}
            for r in rows]


def first_sentence(text):
    if not text:
        return None
    # Split at the first ". " followed by a capital letter, so "e.g." or "4.5 mg" doesn't cut it short.
    match = re.search(r"^(.+?\.)\s+(?=[A-Z])", text)
    return match.group(1) if match else text
