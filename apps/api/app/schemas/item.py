import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ItemKind = Literal["note", "document", "reference"]


class ItemCreate(BaseModel):
    kind: ItemKind
    title: str = Field(min_length=1, max_length=300)
    body: str = ""
    url: str | None = None

    @field_validator("title")
    @classmethod
    def strip_and_reject_blank(cls, value: str) -> str:
        # "   " passes min_length but would render as a blank row everywhere.
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped

    @field_validator("url")
    @classmethod
    def strip_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def require_url_for_reference(self) -> "ItemCreate":
        if self.kind == "reference" and not self.url:
            raise ValueError("url is required for a reference item.")
        return self


class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = None
    url: str | None = None

    @field_validator("title")
    @classmethod
    def strip_and_reject_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped


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
