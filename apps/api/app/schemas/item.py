import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ItemKind = Literal["note", "document", "reference"]


class ItemCreate(BaseModel):
    kind: ItemKind
    title: str = Field(min_length=1, max_length=300)
    body: str = ""
    url: str | None = None

    @model_validator(mode="after")
    def require_url_for_reference(self) -> "ItemCreate":
        if self.kind == "reference" and not self.url:
            raise ValueError("url is required for a reference item.")
        return self


class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = None
    url: str | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    space_id: uuid.UUID
    kind: ItemKind
    title: str
    body: str
    url: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
