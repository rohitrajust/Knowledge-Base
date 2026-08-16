"""FastAPI dependencies that resolve "current user" and "current space" for a request.

`get_current_space` is the single choke point that enforces space isolation: it is the
only place `current_space_id` is derived from (a path parameter verified against
`space_memberships`), and every space-scoped router depends on it rather than trusting a
client-supplied `space_id` in a request body. It also activates the Postgres RLS session
variable so isolation is enforced by two independent layers, not just this check.
"""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Path, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.session import get_valid_session
from app.config import get_settings
from app.core.context import space_id_var, user_id_var
from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.query_scoping import activate_rls_for_space, activate_rls_for_user
from app.db.session import get_db
from app.models.space import Space
from app.models.space_membership import SpaceMembership
from app.models.user import User

settings = get_settings()


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    raw_cookie = request.cookies.get(settings.session_cookie_name)
    if raw_cookie is None:
        raise UnauthorizedError("Not authenticated.")

    try:
        session_id = uuid.UUID(raw_cookie)
    except ValueError as exc:
        raise UnauthorizedError("Not authenticated.") from exc

    session = await get_valid_session(db, session_id)
    if session is None:
        raise UnauthorizedError("Session expired or invalid.")

    result = await db.execute(select(User).where(User.id == session.user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise UnauthorizedError("Not authenticated.")

    await activate_rls_for_user(db, user.id)
    user_id_var.set(str(user.id))
    return user


@dataclass
class CurrentSpace:
    space: Space
    role: str


async def get_current_space(
    space_id: uuid.UUID = Path(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentSpace:
    result = await db.execute(
        select(SpaceMembership).where(
            SpaceMembership.space_id == space_id,
            SpaceMembership.user_id == user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        # 404, not 403: don't confirm a space's existence to non-members.
        raise NotFoundError("Space not found.")

    await activate_rls_for_space(db, space_id)
    space_id_var.set(str(space_id))

    space_result = await db.execute(select(Space).where(Space.id == space_id))
    space = space_result.scalar_one()

    return CurrentSpace(space=space, role=membership.role)


async def require_space_owner(current: CurrentSpace = Depends(get_current_space)) -> CurrentSpace:
    if current.role != "owner":
        raise ForbiddenError("Only the space owner can perform this action.")
    return current
