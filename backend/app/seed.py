import numpy as np
import pandas as pd
from sqlalchemy import func, insert, select, text

from app.core.config import BASE_DIR
from app.core.database import Base, SessionLocal, engine
from app.models.tables import Drug, KnownInteraction

PROCESSED = BASE_DIR / "data" / "processed"
BATCH = 10_000


def records(df):
    return df.astype(object).where(df.notna(), None).to_dict("records")


def load(session, model, rows):
    for start in range(0, len(rows), BATCH):
        session.execute(insert(model), rows[start:start + BATCH])


def main():
    drugs = pd.read_parquet(PROCESSED / "drugs.parquet")
    drugs = drugs.merge(pd.read_parquet(PROCESSED / "conformers.parquet"), on="drug_id", how="left")
    drugs = drugs.merge(pd.read_parquet(PROCESSED / "identifiers.parquet"), on="drug_id", how="left")
    drugs = drugs.merge(pd.read_parquet(PROCESSED / "descriptions.parquet"), on="drug_id", how="left")
    interactions = pd.read_parquet(PROCESSED / "known_interactions.parquet")
    drugs["synonyms"] = drugs.synonyms.apply(list)
    for column in ["ddinter_ids", "kegg_ids"]:  # Parquet gives arrays (or NaN); PostgreSQL wants lists or NULL
        drugs[column] = drugs[column].apply(lambda ids: list(ids) if isinstance(ids, (list, np.ndarray)) else None)

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    # Only the drug tables are rebuilt; create_all adds the account tables if missing and never drops them.
    Base.metadata.drop_all(engine, tables=[KnownInteraction.__table__, Drug.__table__])
    Base.metadata.create_all(engine)

    with SessionLocal.begin() as session:
        load(session, Drug, records(drugs))
        load(session, KnownInteraction, records(interactions))
    with engine.begin() as conn:
        conn.execute(text("ANALYZE drugs, known_interactions"))

    with SessionLocal() as session:
        n_drugs = session.scalar(select(func.count()).select_from(Drug))
        n_rows = session.scalar(select(func.count()).select_from(KnownInteraction))
    print(f"drugs: {n_drugs:,} (file has {len(drugs):,})")
    print(f"known_interactions: {n_rows:,} (file has {len(interactions):,})")
    if (n_drugs, n_rows) != (len(drugs), len(interactions)):
        raise SystemExit("row counts don't match the Parquet files")


if __name__ == "__main__":
    main()
