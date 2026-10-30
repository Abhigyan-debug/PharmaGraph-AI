from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import CATALOG_LIMIT, SEARCH_LIMIT, STRUCTURE_LIMIT
from app.models.schemas import DrugDetail, DrugOut, DrugPage, StructureOut
from app.services.auth import current_user
from app.services.catalog import drug_detail, list_drugs
from app.services.drugs import search_drugs
from app.services.structure import drug_structure

router = APIRouter(prefix="/drugs", tags=["drugs"])


# Public: used by the landing page's quick check.
@router.get("/search", response_model=list[DrugOut], dependencies=[Depends(SEARCH_LIMIT)])
def search(q: str = Query(min_length=2, max_length=100, description="part of a drug or brand name"),
           db: Session = Depends(get_db)):
    return search_drugs(db, q)


@router.get("", response_model=DrugPage, dependencies=[Depends(CATALOG_LIMIT), Depends(current_user)])
def drugs(page: int = Query(1, ge=1, le=1000), q: str | None = Query(None, max_length=100),
          db: Session = Depends(get_db)):
    return list_drugs(db, page, q)


@router.get("/{drug_id}", response_model=DrugDetail, dependencies=[Depends(CATALOG_LIMIT), Depends(current_user)])
def drug(drug_id: str, db: Session = Depends(get_db)):
    return drug_detail(db, drug_id)


# Public: the landing page shows molecules before sign-in.
@router.get("/{drug_id}/structure", response_model=StructureOut, dependencies=[Depends(STRUCTURE_LIMIT)])
def structure(drug_id: str, db: Session = Depends(get_db)):
    return drug_structure(db, drug_id)
