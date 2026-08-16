"""Enforcement choke point (app layer) for tenant isolation, paired with Postgres Row-
Level Security (see db/migrations/versions/0002_enable_pgvector_and_rls.py) as a second,
independent layer. Every query against a space-scoped table MUST go through this module
so a missing `space_id` filter is a type error, not a silent leak.

`space_id` here must come from `get_current_space` (app/auth/dependencies.py) -- never
from a client-supplied request body/query field.
"""

import uuid
from typing import TypeVar

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text

from app.models.mixins import SpaceScopedMixin

ModelT = TypeVar("ModelT", bound=SpaceScopedMixin)


async def activate_rls_for_space(db: AsyncSession, space_id: uuid.UUID) -> None:
    """Sets the Postgres session variable RLS policies key off, scoped to the current
    transaction only (`set_config(..., is_local=true)`). Call once per request, after
    space membership has been verified (get_current_space) and before any space-scoped
    query executes.
    """
    await db.execute(
        text("SELECT set_config('app.current_space_id', :space_id, true)"),
        {"space_id": str(space_id)},
    )


async def activate_rls_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Sets the current-user session variable used by RLS policies that scope by
    ownership rather than by space (e.g. "list my spaces"). Call once per request after
    authentication (get_current_user).
    """
    await db.execute(
        text("SELECT set_config('app.current_user_id', :user_id, true)"),
        {"user_id": str(user_id)},
    )


def scoped_select(model: type[ModelT], space_id: uuid.UUID) -> Select:
    """The only sanctioned way to query a tenant table: a SELECT against `model`
    pre-filtered to `space_id`. `model` must be a SpaceScopedMixin subclass.
    """
    return select(model).where(model.space_id == space_id)

