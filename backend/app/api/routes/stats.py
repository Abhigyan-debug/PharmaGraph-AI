from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import CATALOG_LIMIT
from app.models.schemas import Stats
from app.services.catalog import stats

router = APIRouter(prefix="/stats", tags=["stats"])


# Public: the landing page's numbers.
@router.get("", response_model=Stats, dependencies=[Depends(CATALOG_LIMIT)])
def get_stats(db: Session = Depends(get_db)):
    return stats(db)
