"""Idempotent embedding backfill for items created before milestone 4's migration, or
for whenever the embedding model changes. This is an administrative script, like the
Alembic migrations -- it needs to see items across every space, not one at a time, so
(same as migrations) it must be run with a database-owner connection, not the app's
`mnemo_app` role (which is deliberately confined to a single space per request via RLS
and could never see all items across all spaces at once):

    DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" uv run python -m app.backfill_embeddings

The live app never runs with this elevated access; only this kind of offline, reviewed,
cross-tenant maintenance script does.
"""

import asyncio

from sqlalchemy import select

from app.core.embeddings import embed_text
from app.core.logging import configure_logging, get_logger
from app.db.session import async_session_factory
from app.models.item import Item

logger = get_logger(__name__)


async def backfill() -> int:
    async with async_session_factory() as db:
        result = await db.execute(select(Item).where(Item.embedding.is_(None)))
        items = result.scalars().all()
        for item in items:
            item.embedding = await embed_text(f"{item.title}\n\n{item.body}")
            logger.info("embedded_item", item_id=str(item.id))
        await db.commit()
        return len(items)


async def main() -> None:
    configure_logging()
    count = await backfill()
    logger.info("backfill_complete", items_embedded=count)


if __name__ == "__main__":
    asyncio.run(main())
