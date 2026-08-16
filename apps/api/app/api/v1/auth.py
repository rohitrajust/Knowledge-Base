import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import mock_auth
from app.auth.dependencies import get_current_user
from app.auth.session import (
    clear_session_cookie,
    create_session,
    delete_session,
    set_session_cookie,
)
from app.config import get_settings
from app.core.errors import DomainError, UnauthorizedError
from app.db.session import get_db
from app.models.space import Space
from app.models.space_membership import SpaceMembership
from app.models.user import User
from app.schemas.auth import LoginRequest, MeOut, SignupRequest
from app.schemas.space import SpaceOut
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/login", response_model=UserOut)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> User:
    user = await mock_auth.find_user_by_email(db, payload.email)
    # Same generic message whether the email is unknown or the password is wrong --
    # avoids confirming to a caller which part of the pair was incorrect.
    if user is None or not mock_auth.verify_password(payload.password, user.password_hash):
        raise UnauthorizedError("Invalid email or password.")

    session = await create_session(db, user.id)
    set_session_cookie(response, session.id)
    return user


@router.post("/signup", response_model=UserOut, status_code=201)
async def signup(payload: SignupRequest, response: Response, db: AsyncSession = Depends(get_db)) -> User:
    existing = await mock_auth.find_user_by_email(db, payload.email)
    if existing is not None:
        raise DomainError("An account with that email already exists.")

    user = await mock_auth.create_user(db, payload.email, payload.display_name, payload.password)
    session = await create_session(db, user.id)
    set_session_cookie(response, session.id)
    return user


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    raw_cookie = request.cookies.get(settings.session_cookie_name)
    if raw_cookie is not None:
        try:
            await delete_session(db, uuid.UUID(raw_cookie))
        except ValueError:
            pass
    clear_session_cookie(response)
    return {"status": "ok"}


@router.get("/me", response_model=MeOut)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> MeOut:
    result = await db.execute(
        select(Space)
        .join(SpaceMembership, SpaceMembership.space_id == Space.id)
        .where(SpaceMembership.user_id == user.id)
    )
    spaces = result.scalars().all()
    return MeOut(user=UserOut.model_validate(user), spaces=[SpaceOut.model_validate(s) for s in spaces])
