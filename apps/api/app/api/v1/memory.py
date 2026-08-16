import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space
from app.core.active_memory import get_active_memories
from app.core.errors import NotFoundError
from app.core.query_scoping import scoped_select
from app.db.session import get_db
from app.models.memory import MemorySummary
from app.schemas.memory import MemoryOut

router = APIRouter(prefix="/spaces/{space_id}/memory", tags=["memory"])


@router.get("", response_model=list[MemoryOut])
async def list_memories(
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> list[MemorySummary]:
    return await get_active_memories(db, current.space.id)


@router.delete("/{memory_id}", status_code=204)
async def delete_memory(
    memory_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(scoped_select(MemorySummary, current.space.id).where(MemorySummary.id == memory_id))
    memory = result.scalar_one_or_none()
    if memory is None:
        raise NotFoundError("Memory entry not found.")
    await db.delete(memory)
