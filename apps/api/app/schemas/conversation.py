import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.item import ItemKind


class MessageSource(BaseModel):
    """A denormalized snapshot of a cited item at answer time -- title/kind/score are
    stored directly in Message.sources (JSONB) rather than requiring a live fetch of
    the Item row to render history, and survive the source item being deleted later.
    """

    item_id: uuid.UUID
    title: str
    kind: ItemKind
    score: float


class MessageCreate(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    sources: list[MessageSource] | None = None
    created_at: datetime


class ConversationCreate(BaseModel):
    title: str = Field(default="New conversation", max_length=300)


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    space_id: uuid.UUID
    title: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    ended_at: datetime | None


class ConversationDetailOut(ConversationOut):
    messages: list[MessageOut]
