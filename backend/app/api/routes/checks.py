from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.schemas import SavedCheckOut
from app.services.auth import current_user
from app.services.history import delete_check, list_checks

router = APIRouter(prefix="/checks", tags=["history"])


@router.get("", response_model=list[SavedCheckOut])
def history(user=Depends(current_user), db: Session = Depends(get_db)):
    return list_checks(db, user.id)


@router.delete("/{check_id}", status_code=204)
def delete(check_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    delete_check(db, user.id, check_id)
