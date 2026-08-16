"""Shared query for currently-active (non-expired) memory summaries. Used both when
injecting memory into a conversation's context (app/api/v1/conversations.py) and when
listing memory for the UI (app/api/v1/memory.py) -- one place to get "forgetting via
expiry" right, rather than two query sites that could drift apart.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.query_scoping import scoped_select
from app.models.memory import MemorySummary


async def get_active_memories(db: AsyncSession, space_id: uuid.UUID) -> list[MemorySummary]:
    result = await db.execute(
        scoped_select(MemorySummary, space_id)
        .where(MemorySummary.expires_at > datetime.now(timezone.utc))
        .order_by(MemorySummary.created_at.desc())
    )
    return list(result.scalars().all())
