from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space
from app.core.retrieval import retrieve_items
from app.db.session import get_db
from app.schemas.search import SearchResult

router = APIRouter(prefix="/spaces/{space_id}/search", tags=["search"])


@router.get("", response_model=list[SearchResult])
async def search_items(
    q: str = Query(default=""),
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> list[SearchResult]:
    query = q.strip()
    if not query:
        return []

    results = await retrieve_items(db, current.space.id, query, limit=20)
    return [SearchResult(item=item, score=score) for item, score in results]
