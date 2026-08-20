"""Shared embedding-based retrieval, used by semantic search (app/api/v1/search.py),
grounded Q&A (app/api/v1/qa.py), and AI-suggested links (app/api/v1/suggestions.py) so
ranking logic lives in exactly one place.
"""

import uuid

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.embeddings import embed_text
from app.core.query_scoping import scoped_select
from app.models.item import Item


def _rank_by_cosine_similarity(
    query_vector: list[float], candidates: list[Item], limit: int
) -> list[tuple[Item, float]]:
    """Ranks `candidates` by cosine similarity to `query_vector`, most similar first.
    Computed in Python/numpy rather than in SQL (no pgvector extension required) --
    fine at Mnemo's per-space item counts; ranking stays app-side and portable to any
    plain Postgres instance.
    """
    if not candidates:
        return []

    query = np.asarray(query_vector, dtype=np.float64)
    matrix = np.asarray([c.embedding for c in candidates], dtype=np.float64)

    similarities = (matrix @ query) / (
        np.linalg.norm(matrix, axis=1) * np.linalg.norm(query)
    )

    order = np.argsort(-similarities)[:limit]
    return [(candidates[i], float(similarities[i])) for i in order]


async def retrieve_items(
    db: AsyncSession, space_id: uuid.UUID, query: str, limit: int = 20
) -> list[tuple[Item, float]]:
    """Returns (item, similarity_score) pairs for the space's embedded items closest to
    `query`, most similar first. `query` must already be non-empty/stripped -- callers
    decide what an empty query means for them (e.g. search returns [], Q&A short-
    circuits without calling the LLM).
    """
    query_vector = await embed_text(query)

    result = await db.execute(
        scoped_select(Item, space_id).where(Item.embedding.is_not(None))
    )
    candidates = list(result.scalars().all())

    return _rank_by_cosine_similarity(query_vector, candidates, limit)


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

    result = await db.execute(
        scoped_select(Item, space_id).where(
            Item.embedding.is_not(None), Item.id.not_in(exclude_ids)
        )
    )
    candidates = list(result.scalars().all())

    return _rank_by_cosine_similarity(item.embedding, candidates, limit)
