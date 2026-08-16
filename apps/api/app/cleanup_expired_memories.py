"""Idempotent cleanup of expired memory summaries -- the physical-deletion half of
"forgetting" (the logical half is every read filtering `expires_at > now()`, see
app/core/active_memory.py). This is an administrative script, like the Alembic
migrations and app/backfill_embeddings.py -- it needs to see expired rows across every
space, not one at a time, so it must be run with a database-owner connection, not the
app's `mnemo_app` role (which is deliberately confined to a single space per request
via RLS and could never see rows across all spaces at once):

    DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" uv run python -m app.cleanup_expired_memories

The live app never runs with this elevated access; only this kind of offline, reviewed,
cross-tenant maintenance script does.
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import delete

from app.core.logging import configure_logging, get_logger
from app.db.session import async_session_factory
from app.models.memory import MemorySummary

logger = get_logger(__name__)


async def cleanup() -> int:
    async with async_session_factory() as db:
        result = await db.execute(
            delete(MemorySummary)
            .where(MemorySummary.expires_at < datetime.now(timezone.utc))
            .returning(MemorySummary.id)
        )
        deleted_ids = result.scalars().all()
        await db.commit()
        return len(deleted_ids)


async def main() -> None:
    configure_logging()
    count = await cleanup()
    logger.info("cleanup_complete", memories_deleted=count)


if __name__ == "__main__":
    asyncio.run(main())
