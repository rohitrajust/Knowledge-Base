import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user_session import UserSession

settings = get_settings()


async def create_session(db: AsyncSession, user_id: uuid.UUID) -> UserSession:
    session = UserSession(
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.session_ttl_seconds),
    )
    db.add(session)
    # Committed here rather than left to `get_db`'s teardown commit. A flush alone
    # makes the row visible only inside this transaction, while the login response --
    # carrying the Set-Cookie the client is expected to use immediately -- can reach
    # that client before the teardown commit lands. Any request issued in that window
    # runs on a *different* pooled connection, cannot see the uncommitted row, and is
    # rejected with "Session expired or invalid."
    #
    # The web app hits this window on every single sign-in: it calls `refresh()`
    # (GET /auth/me) the instant login resolves. Reproduced at ~4 failures in 5
    # attempts against a warm server. Committing before the response is built closes
    # the window entirely; `get_db`'s later commit then becomes a no-op.
    await db.commit()
    return session


async def get_valid_session(db: AsyncSession, session_id: uuid.UUID) -> UserSession | None:
    result = await db.execute(select(UserSession).where(UserSession.id == session_id))
    session = result.scalar_one_or_none()
    if session is None:
        return None
    if session.expires_at < datetime.now(timezone.utc):
        return None
    return session


async def delete_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    await db.execute(delete(UserSession).where(UserSession.id == session_id))


def set_session_cookie(response: Response, session_id: uuid.UUID) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=str(session_id),
        httponly=True,
        samesite="lax",
        secure=settings.env != "development",
        max_age=settings.session_ttl_seconds,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.session_cookie_name, path="/")
