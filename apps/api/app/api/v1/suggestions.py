import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space
from app.core.item_lookup import get_item_or_404, get_linked_item_ids
from app.core.retrieval import suggest_related_items
from app.db.session import get_db
from app.schemas.search import SearchResult

router = APIRouter(prefix="/spaces/{space_id}/items/{item_id}/suggested-links", tags=["suggestions"])


@router.get("", response_model=list[SearchResult])
async def get_suggested_links(
    item_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> list[SearchResult]:
    item = await get_item_or_404(db, current.space.id, item_id)
    linked_ids = await get_linked_item_ids(db, current.space.id, item_id)
    exclude_ids = linked_ids | {item_id}

    results = await suggest_related_items(db, current.space.id, item, exclude_ids, limit=5)
    return [SearchResult(item=candidate, score=score) for candidate, score in results]
