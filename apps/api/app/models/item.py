import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import SpaceScopedMixin

ITEM_KINDS = ("note", "document", "reference")


class Item(Base, SpaceScopedMixin):
    """A single piece of captured knowledge (note, document, or reference) inside a
    space. Deliberately one table with a `kind` discriminator rather than three tables,
    so milestone 3 (graph nodes) and milestone 4 (embeddings) can treat all captured
    content uniformly.
    """

    __tablename__ = "items"
    __table_args__ = (CheckConstraint(f"kind IN {ITEM_KINDS}", name="ck_items_kind"),)

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    url: Mapped[str | None] = mapped_column(String, nullable=True)
    # Nullable: items created before milestone 4's migration (or if embedding generation
    # is ever skipped) have no embedding until app/backfill_embeddings.py runs. Search
    # (app/api/v1/search.py) explicitly excludes NULL embeddings rather than erroring.
    # Plain float array, not pgvector's Vector type -- similarity is computed in Python
    # (app/core/retrieval.py) so the pgvector extension is never required.
    embedding: Mapped[list[float] | None] = mapped_column(ARRAY(Float), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
