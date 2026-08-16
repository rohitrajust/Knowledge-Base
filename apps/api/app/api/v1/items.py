import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space, get_current_user
from app.core.embeddings import embed_text
from app.core.item_lookup import get_item_or_404
from app.core.query_scoping import scoped_select
from app.db.session import get_db
from app.models.item import Item
from app.models.user import User
from app.schemas.item import ItemCreate, ItemOut, ItemUpdate

router = APIRouter(prefix="/spaces/{space_id}/items", tags=["items"])


def _embeddable_text(title: str, body: str) -> str:
    return f"{title}\n\n{body}"


@router.post("", response_model=ItemOut, status_code=201)
async def create_item(
    payload: ItemCreate,
    user: User = Depends(get_current_user),
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> Item:
    embedding = await embed_text(_embeddable_text(payload.title, payload.body))
    item = Item(
        space_id=current.space.id,
        kind=payload.kind,
        title=payload.title,
        body=payload.body,
        url=payload.url,
        embedding=embedding,
        created_by=user.id,
    )
    db.add(item)
    await db.flush()
    return item


@router.get("", response_model=list[ItemOut])
async def list_items(
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> list[Item]:
    result = await db.execute(scoped_select(Item, current.space.id).order_by(Item.updated_at.desc()))
    return list(result.scalars().all())


@router.get("/{item_id}", response_model=ItemOut)
async def get_item(
    item_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> Item:
    return await get_item_or_404(db, current.space.id, item_id)


@router.patch("/{item_id}", response_model=ItemOut)
async def update_item(
    item_id: uuid.UUID,
    payload: ItemUpdate,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> Item:
    item = await get_item_or_404(db, current.space.id, item_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(item, field, value)

    # Re-embed whenever the searchable text (title or body) changes. Keeping this rule
    # simple (rather than trying to detect "did the text actually change") avoids stale
    # embeddings from a cleverness bug; a url-only update on a reference skips it.
    if "title" in updates or "body" in updates:
        item.embedding = await embed_text(_embeddable_text(item.title, item.body))

    await db.flush()
    # `updated_at` is server-generated (onupdate=func.now()); refresh so the response
    # model doesn't try to lazily load it outside the request's async context.
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
async def delete_item(
    item_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> None:
    item = await get_item_or_404(db, current.space.id, item_id)
    await db.delete(item)
