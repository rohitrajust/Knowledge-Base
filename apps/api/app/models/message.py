import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import SpaceScopedMixin

MESSAGE_ROLES = ("user", "assistant")


class Message(Base, SpaceScopedMixin):
    """A single turn in a Conversation. `space_id` is denormalized onto this table (not
    just reachable via conversation_id) so RLS policies stay uniform across every
    table, matching the convention established for item_links.

    `sources` is a JSONB snapshot ([{"item_id": ..., "score": ...}, ...]) of what was
    cited at answer time -- not a live FK relationship, since historical citations may
    legitimately reference since-deleted items.
    """

    __tablename__ = "messages"
    __table_args__ = (CheckConstraint(f"role IN {MESSAGE_ROLES}", name="ck_messages_role"),)

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
