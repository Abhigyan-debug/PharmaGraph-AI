import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import get_db
from app.models.tables import User, UserSession

COOKIE = "pg_session"
# OWASP's minimum for scrypt: 2^17 rounds of 1 KiB blocks, 128 MiB of memory per hash.
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**17, 8, 1


def hash_password(password, salt=None, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, maxmem=2**28)
    return f"scrypt${n}${r}${p}${salt.hex()}${digest.hex()}"


def password_matches(password, stored):
    _, n, r, p, salt, _ = stored.split("$")
    candidate = hash_password(password, bytes.fromhex(salt), int(n), int(r), int(p))
    return hmac.compare_digest(candidate, stored)


# Checked when the email is unknown, so a wrong email takes as long as a wrong password.
DUMMY_HASH = hash_password(secrets.token_urlsafe())


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def now():
    return datetime.now(timezone.utc)


def register(db, email, password):
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail={"error": "email_taken",
                                                     "detail": "an account with this email already exists"})
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    return user


def login(db, email, password):
    user = db.scalar(select(User).where(User.email == email))
    matches = password_matches(password, user.password_hash if user else DUMMY_HASH)
    if user is None or not matches:
        raise HTTPException(status_code=401, detail={"error": "wrong_login", "detail": "email or password is wrong"})
    return user


def start_session(db, response, user):
    token = secrets.token_urlsafe(32)
    db.execute(delete(UserSession).where(UserSession.expires_at < now()))
    db.add(UserSession(token_hash=token_hash(token), user_id=user.id,
                       expires_at=now() + timedelta(days=settings.SESSION_DAYS)))
    db.commit()
    response.set_cookie(COOKIE, token, max_age=settings.SESSION_DAYS * 86400, path="/",
                        httponly=True, secure=settings.HTTPS, samesite="lax")


def end_session(db, request, response):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == token_hash(token)))
        db.commit()
    response.delete_cookie(COOKIE, path="/", httponly=True, secure=settings.HTTPS, samesite="lax")


def current_user(request: Request, db=Depends(get_db)):
    token = request.cookies.get(COOKIE)
    session = db.get(UserSession, token_hash(token)) if token else None
    if session is None or session.expires_at < now():
        raise HTTPException(status_code=401, detail={"error": "not_signed_in", "detail": "sign in to continue"})
    return db.get(User, session.user_id)


def delete_account(db, user):
    # The foreign keys cascade, so sessions and saved checks go with the user.
    db.execute(delete(User).where(User.id == user.id))
    db.commit()


def optional_user(request: Request, db=Depends(get_db)):
    """The signed-in user, or None: for endpoints that also work without an account."""
    try:
        return current_user(request, db)
    except HTTPException:
        return None
