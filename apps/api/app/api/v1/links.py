import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space, get_current_user
from app.core.errors import DomainError, NotFoundError
from app.core.item_lookup import get_item_or_404
from app.core.query_scoping import scoped_select
from app.core.relations import direction_out, resolve_direction
from app.db.session import get_db
from app.models.item import Item
from app.models.item_link import ItemLink
from app.models.user import User
from app.schemas.link import LinkCreate, LinkedItemOut, LinkUpdate

router = APIRouter(prefix="/spaces/{space_id}/items/{item_id}/links", tags=["links"])


@router.post("", response_model=LinkedItemOut, status_code=201)
async def create_link(
    item_id: uuid.UUID,
    payload: LinkCreate,
    user: User = Depends(get_current_user),
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> LinkedItemOut:
    if payload.other_item_id == item_id:
        raise DomainError("An item cannot be linked to itself.")

    await get_item_or_404(db, current.space.id, item_id)
    other = await get_item_or_404(db, current.space.id, payload.other_item_id)

    item_a_id, item_b_id = sorted([item_id, payload.other_item_id])

    existing = await db.execute(
        scoped_select(ItemLink, current.space.id).where(
            ItemLink.item_a_id == item_a_id, ItemLink.item_b_id == item_b_id
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise DomainError("These items are already linked.")

    # The link is created *from* `item_id`, so that is the source of a directed
    # relation regardless of which canonical column it ends up in.
    direction = resolve_direction(payload.relation, item_id, item_a_id)

    link = ItemLink(
        space_id=current.space.id,
        item_a_id=item_a_id,
        item_b_id=item_b_id,
        relation=payload.relation,
        direction=direction,
        created_by=user.id,
    )
    db.add(link)
    await db.flush()

    return LinkedItemOut(
        link_id=link.id,
        created_at=link.created_at,
        relation=link.relation,
        direction_out=direction_out(item_a_id, item_b_id, direction, item_id),
        item=other,
    )


@router.get("", response_model=list[LinkedItemOut])
async def list_links(
    item_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> list[LinkedItemOut]:
    await get_item_or_404(db, current.space.id, item_id)

    links_result = await db.execute(
        scoped_select(ItemLink, current.space.id).where(
            or_(ItemLink.item_a_id == item_id, ItemLink.item_b_id == item_id)
        )
    )
    links = links_result.scalars().all()
    if not links:
        return []

    other_ids = [link.item_b_id if link.item_a_id == item_id else link.item_a_id for link in links]
    items_result = await db.execute(scoped_select(Item, current.space.id).where(Item.id.in_(other_ids)))
    items_by_id = {item.id: item for item in items_result.scalars().all()}

    return [
        LinkedItemOut(
            link_id=link.id,
            created_at=link.created_at,
            relation=link.relation,
            direction_out=direction_out(link.item_a_id, link.item_b_id, link.direction, item_id),
            item=items_by_id[link.item_b_id if link.item_a_id == item_id else link.item_a_id],
        )
        for link in links
    ]


@router.patch("/{link_id}", response_model=LinkedItemOut)
async def update_link(
    item_id: uuid.UUID,
    link_id: uuid.UUID,
    payload: LinkUpdate,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> LinkedItemOut:
    """Retype an existing link.

    Needed because UNIQUE(item_a_id, item_b_id) allows only one link per pair, so
    "change the relation" cannot be expressed as delete-then-recreate without a
    window where the link does not exist. Direction is recomputed from the item the
    request came through, which is also what makes it possible to flip a directed
    relation by re-issuing the PATCH from the other endpoint.
    """
    await get_item_or_404(db, current.space.id, item_id)

    result = await db.execute(
        scoped_select(ItemLink, current.space.id).where(
            ItemLink.id == link_id, or_(ItemLink.item_a_id == item_id, ItemLink.item_b_id == item_id)
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise NotFoundError("Link not found.")

    link.relation = payload.relation
    link.direction = resolve_direction(payload.relation, item_id, link.item_a_id)
    await db.flush()

    other_id = link.item_b_id if link.item_a_id == item_id else link.item_a_id
    other = await get_item_or_404(db, current.space.id, other_id)

    return LinkedItemOut(
        link_id=link.id,
        created_at=link.created_at,
        relation=link.relation,
        direction_out=direction_out(link.item_a_id, link.item_b_id, link.direction, item_id),
        item=other,
    )


@router.delete("/{link_id}", status_code=204)
async def delete_link(
    item_id: uuid.UUID,
    link_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        scoped_select(ItemLink, current.space.id).where(
            ItemLink.id == link_id, or_(ItemLink.item_a_id == item_id, ItemLink.item_b_id == item_id)
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise NotFoundError("Link not found.")
    await db.delete(link)
