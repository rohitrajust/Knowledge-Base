"""Shared embedding-based retrieval, used by semantic search (app/api/v1/search.py),
grounded Q&A (app/api/v1/qa.py), and AI-suggested links (app/api/v1/suggestions.py) so
ranking logic lives in exactly one place.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.embeddings import embed_text
from app.core.query_scoping import scoped_select
from app.models.item import Item


async def retrieve_items(
    db: AsyncSession, space_id: uuid.UUID, query: str, limit: int = 20
) -> list[tuple[Item, float]]:
    """Returns (item, similarity_score) pairs for the space's embedded items closest to
    `query`, most similar first. `query` must already be non-empty/stripped -- callers
    decide what an empty query means for them (e.g. search returns [], Q&A short-
    circuits without calling the LLM).
    """
    query_vector = await embed_text(query)
    distance = Item.embedding.cosine_distance(query_vector)

    result = await db.execute(
        scoped_select(Item, space_id)
        .where(Item.embedding.is_not(None))
        .order_by(distance)
        .limit(limit)
        .add_columns(distance)
    )

    return [(item, 1 - dist) for item, dist in result.all()]


async def suggest_related_items(
    db: AsyncSession,
    space_id: uuid.UUID,
    item: Item,
    exclude_ids: set[uuid.UUID],
    limit: int = 5,
) -> list[tuple[Item, float]]:
    """Returns (item, similarity_score) pairs for the space's items closest to `item`'s
    own embedding, most similar first, excluding `exclude_ids` (the item itself and
    anything already linked to it -- callers build this set, see
    app/api/v1/suggestions.py). No LLM involved: pure embedding similarity, same as
    retrieve_items, just comparing an existing item's embedding instead of a fresh
    query string.
    """
    if item.embedding is None:
        return []

    distance = Item.embedding.cosine_distance(item.embedding)

    result = await db.execute(
        scoped_select(Item, space_id)
        .where(Item.embedding.is_not(None), Item.id.not_in(exclude_ids))
        .order_by(distance)
        .limit(limit)
        .add_columns(distance)
    )

    return [(candidate, 1 - dist) for candidate, dist in result.all()]
