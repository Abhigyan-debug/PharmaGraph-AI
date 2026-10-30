from fastapi import HTTPException
from sqlalchemy import delete, select

from app.models.tables import Drug, SavedCheck
from app.services.drugs import first_sentence

HISTORY_LIMIT = 50


def save_check(db, user_id, drug_ids):
    db.add(SavedCheck(user_id=user_id, drug_ids=drug_ids))
    db.commit()


def list_checks(db, user_id):
    checks = db.scalars(select(SavedCheck).where(SavedCheck.user_id == user_id)
                        .order_by(SavedCheck.created_at.desc(), SavedCheck.id.desc())
                        .limit(HISTORY_LIMIT)).all()
    ids = {drug_id for check in checks for drug_id in check.drug_ids}
    drugs = {row.drug_id: row for row in db.execute(select(Drug.drug_id, Drug.name, Drug.description)
                                                    .where(Drug.drug_id.in_(ids)))}
    def entry(drug_id):
        drug = drugs.get(drug_id)  # a reseed could in theory drop a drug; keep the id rather than fail
        return {"id": drug_id, "name": drug.name if drug else drug_id,
                "summary": first_sentence(drug.description) if drug else None}
    return [{"id": check.id, "created_at": check.created_at, "drugs": [entry(i) for i in check.drug_ids]}
            for check in checks]


def delete_check(db, user_id, check_id):
    # Filtering on user_id too means nobody can delete another person's check by guessing its id.
    deleted = db.execute(delete(SavedCheck).where(SavedCheck.id == check_id,
                                                  SavedCheck.user_id == user_id)).rowcount
    db.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail={"error": "check_not_found", "detail": check_id})
