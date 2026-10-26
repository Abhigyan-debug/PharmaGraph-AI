from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.schemas import DrugOut
from app.services.drugs import search_drugs

router = APIRouter(prefix="/drugs", tags=["drugs"])


@router.get("/search", response_model=list[DrugOut])
def search(q: str = Query(min_length=2, max_length=100, description="part of a drug or brand name"),
           db: Session = Depends(get_db)):
    return search_drugs(db, q)
