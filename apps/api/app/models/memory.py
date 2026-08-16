import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import SpaceScopedMixin


class MemorySummary(Base, SpaceScopedMixin):
    """A durable fact/decision auto-extracted from a conversation when it's explicitly
    ended (see app/api/v1/conversations.py and app/core/prompting.py:SUMMARY_SYSTEM_PROMPT
    for the anti-hallucination guardrail). Shared at the space level -- visible to every
    member of the space, not just whoever's conversation produced it (see
    docs/architecture/milestone-1-foundations.md). Forgotten via automatic expiry:
    `expires_at` is checked at every read (app/api/v1/memory.py, app/api/v1/conversations.py),
    and app/cleanup_expired_memories.py physically deletes expired rows.
    """

    __tablename__ = "memory_summaries"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
