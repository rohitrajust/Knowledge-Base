import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import SpaceScopedMixin

# The relation vocabulary. Stored as a plain String + CheckConstraint rather than a
# Postgres ENUM, matching how `items.kind` is handled (app/models/item.py): adding a
# value later is then an ordinary constraint swap instead of an ALTER TYPE that has
# to run outside a transaction.
RELATION_TYPES = ("related", "references", "depends_on", "supersedes", "part_of")

# Relations whose endpoints are NOT interchangeable. "A supersedes B" says something
# different from "B supersedes A", whereas "A is related to B" does not -- so only
# these need a stored direction.
DIRECTED_RELATIONS = frozenset({"references", "depends_on", "supersedes", "part_of"})

# `a_to_b` / `b_to_a` are relative to the canonical (item_a_id < item_b_id) storage
# order, not to whoever created the link.
LINK_DIRECTIONS = ("none", "a_to_b", "b_to_a")


class ItemLink(Base, SpaceScopedMixin):
    """A typed connection between two items in the same space.

    `item_a_id < item_b_id` is enforced at the DB level so the pair is stored in a
    canonical order -- this both prevents self-links and lets a UNIQUE constraint rule
    out duplicate/reverse-duplicate links without extra application logic.

    Direction is carried by the separate `direction` column rather than by which
    column an item lands in. Storing "A supersedes B" as (a=B, b=A) would mean giving
    up the canonical ordering, and with it the UNIQUE constraint that makes
    reverse-duplicates impossible; keeping the ordering and recording the semantic
    direction alongside it preserves both properties at once.
    """

    __tablename__ = "item_links"
    __table_args__ = (
        CheckConstraint("item_a_id < item_b_id", name="ck_item_links_canonical_order"),
        CheckConstraint(f"relation IN {RELATION_TYPES}", name="ck_item_links_relation"),
        CheckConstraint(f"direction IN {LINK_DIRECTIONS}", name="ck_item_links_direction"),
        UniqueConstraint("item_a_id", "item_b_id", name="uq_item_links_pair"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_a_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_b_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relation: Mapped[str] = mapped_column(String, nullable=False, server_default="related")
    direction: Mapped[str] = mapped_column(String, nullable=False, server_default="none")
    created_by: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
