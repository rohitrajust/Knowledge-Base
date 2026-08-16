import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import SpaceScopedMixin


class ItemLink(Base, SpaceScopedMixin):
    """An undirected, unlabeled connection between two items in the same space.
    `item_a_id < item_b_id` is enforced at the DB level so the pair is stored in a
    canonical order -- this both prevents self-links and lets a UNIQUE constraint rule
    out duplicate/reverse-duplicate links without extra application logic.
    """

    __tablename__ = "item_links"
    __table_args__ = (
        CheckConstraint("item_a_id < item_b_id", name="ck_item_links_canonical_order"),
        UniqueConstraint("item_a_id", "item_b_id", name="uq_item_links_pair"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_a_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_b_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
