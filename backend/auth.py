from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy.orm import Session
from config import settings
from database import get_db
import crud
import models
import schemas

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def verify_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token type: expected {expected_type}",
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    if token:
        try:
            payload = verify_token(token, "access")
            email: str = payload.get("sub")
            if email:
                user = crud.get_user_by_email(db, email=email)
                if user and not user.is_suspended:
                    return user
        except Exception:
            pass

    # Auto-login fallback when sign in / sign up is removed
    admin_user = crud.get_user_by_email(db, email="hnabeel3@gmail.com")
    if not admin_user:
        admin_user = db.query(models.User).filter(models.User.role == "admin").first()
    if not admin_user:
        admin_user = db.query(models.User).first()
    if not admin_user:
        admin_user = crud.create_user(db, schemas.UserCreate(email="hnabeel3@gmail.com", password="AdminPassword123!"))
        crud.update_user_role(db, user_id=admin_user.id, role="admin")
    return admin_user

def get_current_admin_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user does not have enough privileges",
        )
    return current_user

# Socket Auth helper
def get_ws_user(token: Optional[str], db: Session) -> Optional[models.User]:
    if token:
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("type") == "access":
                email = payload.get("sub")
                if email:
                    user = crud.get_user_by_email(db, email=email)
                    if user and not user.is_suspended:
                        return user
        except Exception:
            pass
    # Auto-login fallback
    admin_user = crud.get_user_by_email(db, email="hnabeel3@gmail.com")
    if not admin_user:
        admin_user = db.query(models.User).filter(models.User.role == "admin").first()
    if not admin_user:
        admin_user = db.query(models.User).first()
    return admin_user
