import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def strip_and_reject_blank(cls, value: str) -> str:
        # Whitespace-only names would create an unrenderable space row.
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class SpaceUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def strip_and_reject_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class SpaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    created_by: uuid.UUID
    created_at: datetime
