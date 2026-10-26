from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.schemas import DrugSelection, KnownInteractionsResponse
from app.services.interactions import known_interactions

router = APIRouter(prefix="/interactions", tags=["interactions"])


@router.post("/known", response_model=KnownInteractionsResponse)
def known(selection: DrugSelection, db: Session = Depends(get_db)):
    return known_interactions(db, selection.drug_ids)


@router.post("/predict")
def predict():
    return {}
