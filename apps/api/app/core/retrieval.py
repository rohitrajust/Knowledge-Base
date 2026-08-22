"""Shared embedding-based retrieval, used by semantic search (app/api/v1/search.py),
grounded Q&A (app/api/v1/qa.py), AI-suggested links (app/api/v1/suggestions.py), and
conversations (app/api/v1/conversations.py) so ranking logic lives in exactly one place.

Ranking runs app-side in numpy over lightweight (id, embedding) rows, then full item
rows are fetched only for the top-k winners -- identical ranking to loading every full
item, without dragging each item's whole body through the ORM on every question. This
stays portable to any plain Postgres instance (no pgvector required; see README.md's
"Isolation and auth conventions").
"""

import uuid

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.embeddings import embed_text
from app.core.query_scoping import scoped_select
from app.models.item import Item


def _rank_by_cosine_similarity(
    query_vector: list[float], embedding_rows: list[tuple[uuid.UUID, list[float]]], limit: int
) -> list[tuple[uuid.UUID, float]]:
    """Ranks `(item_id, embedding)` rows by cosine similarity to `query_vector`, most
    similar first. Computed in Python/numpy rather than in SQL (no pgvector extension
    required) -- fine at Mnemo's per-space item counts; ranking stays app-side and
    portable to any plain Postgres instance.
    """
    if not embedding_rows:
        return []

    query = np.asarray(query_vector, dtype=np.float64)
    matrix = np.asarray([embedding for _, embedding in embedding_rows], dtype=np.float64)

    similarities = (matrix @ query) / (
        np.linalg.norm(matrix, axis=1) * np.linalg.norm(query)
    )

    order = np.argsort(-similarities)[:limit]
    return [(embedding_rows[i][0], float(similarities[i])) for i in order]


async def _fetch_embedding_rows(
    db: AsyncSession, space_id: uuid.UUID, exclude_ids: set[uuid.UUID] | None = None
) -> list[tuple[uuid.UUID, list[float]]]:
    stmt = (
        scoped_select(Item, space_id)
        .with_only_columns(Item.id, Item.embedding)
        .where(Item.embedding.is_not(None))
    )
    if exclude_ids:
        stmt = stmt.where(Item.id.not_in(exclude_ids))
    result = await db.execute(stmt)
    return [(row.id, row.embedding) for row in result.all()]


async def _fetch_items(db: AsyncSession, space_id: uuid.UUID, ids: list[uuid.UUID]) -> dict[uuid.UUID, Item]:
    if not ids:
        return {}
    result = await db.execute(scoped_select(Item, space_id).where(Item.id.in_(ids)))
    return {item.id: item for item in result.scalars().all()}


async def embed_query(query: str) -> list[float]:
    """Embeds a query string off the event loop. Split out from `retrieve_items` so
    callers that also do DB work can overlap this CPU-bound step with their queries
    (see post_message in app/api/v1/conversations.py).
    """
    return await embed_text(query)


async def rank_items(
    db: AsyncSession, space_id: uuid.UUID, query_vector: list[float], limit: int = 20
) -> list[tuple[Item, float]]:
    """Ranks the space's embedded items against a precomputed query vector and returns
    `(item, similarity_score)` pairs, most similar first. Companion to `embed_query`;
    use `retrieve_items` when no overlap is needed.
    """
    ranked = _rank_by_cosine_similarity(query_vector, await _fetch_embedding_rows(db, space_id), limit)
    items = await _fetch_items(db, space_id, [item_id for item_id, _score in ranked])
    return [(items[item_id], score) for item_id, score in ranked if item_id in items]


async def retrieve_items(
    db: AsyncSession, space_id: uuid.UUID, query: str, limit: int = 20
) -> list[tuple[Item, float]]:
    """Returns (item, similarity_score) pairs for the space's embedded items closest to
    `query`, most similar first. `query` must already be non-empty/stripped -- callers
    decide what an empty query means for them (e.g. search returns [], Q&A short-
    circuits without calling the LLM).
    """
    return await rank_items(db, space_id, await embed_query(query), limit)


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

    ranked = _rank_by_cosine_similarity(
        item.embedding, await _fetch_embedding_rows(db, space_id, exclude_ids=exclude_ids), limit
    )
    items = await _fetch_items(db, space_id, [item_id for item_id, _score in ranked])
    return [(items[item_id], score) for item_id, score in ranked if item_id in items]
