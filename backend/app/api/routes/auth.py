from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import AUTH_LIMIT
from app.models.schemas import Credentials, RegisterIn, UserOut
from app.services.auth import current_user, delete_account, end_session, login, register, start_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201, response_model=UserOut, dependencies=[Depends(AUTH_LIMIT)])
def register_route(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    user = register(db, body.email, body.password)
    start_session(db, response, user)
    return user


@router.post("/login", response_model=UserOut, dependencies=[Depends(AUTH_LIMIT)])
def login_route(body: Credentials, response: Response, db: Session = Depends(get_db)):
    user = login(db, body.email, body.password)
    start_session(db, response, user)
    return user


@router.post("/logout", status_code=204)
def logout_route(request: Request, response: Response, db: Session = Depends(get_db)):
    end_session(db, request, response)


@router.get("/me", response_model=UserOut)
def me(user=Depends(current_user)):
    return user


@router.delete("/me", status_code=204)
def delete_me(request: Request, response: Response, user=Depends(current_user), db: Session = Depends(get_db)):
    end_session(db, request, response)
    delete_account(db, user)
