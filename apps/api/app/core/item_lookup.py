"""Shared item/link lookups, used by every endpoint that needs to resolve a specific
item within a space or find what it's already linked to (app/api/v1/items.py, links.py,
suggestions.py) -- one place for these, rather than a private copy per router module.
"""

import uuid

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.query_scoping import scoped_select
from app.models.item import Item
from app.models.item_link import ItemLink


async def get_item_or_404(db: AsyncSession, space_id: uuid.UUID, item_id: uuid.UUID) -> Item:
    result = await db.execute(scoped_select(Item, space_id).where(Item.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise NotFoundError("Item not found.")
    return item


async def get_linked_item_ids(db: AsyncSession, space_id: uuid.UUID, item_id: uuid.UUID) -> set[uuid.UUID]:
    """The set of item IDs already linked to `item_id`, regardless of which side of the
    canonical (item_a_id, item_b_id) pair they're stored on.
    """
    result = await db.execute(
        scoped_select(ItemLink, space_id).where(or_(ItemLink.item_a_id == item_id, ItemLink.item_b_id == item_id))
    )
    links = result.scalars().all()
    return {link.item_b_id if link.item_a_id == item_id else link.item_a_id for link in links}
