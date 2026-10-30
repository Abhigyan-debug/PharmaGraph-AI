from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import CHECK_LIMIT
from app.models.schemas import DrugSelection, KnownInteractionsResponse
from app.services.auth import optional_user
from app.services.history import save_check
from app.services.interactions import known_interactions

router = APIRouter(prefix="/interactions", tags=["interactions"])


@router.post("/known", response_model=KnownInteractionsResponse, dependencies=[Depends(CHECK_LIMIT)])
def known(selection: DrugSelection, user=Depends(optional_user), db: Session = Depends(get_db)):
    result = known_interactions(db, selection.drug_ids)
    if user:  # only signed-in checks are saved
        save_check(db, user.id, selection.drug_ids)
    return result


@router.post("/predict")
def predict():
    return {}
