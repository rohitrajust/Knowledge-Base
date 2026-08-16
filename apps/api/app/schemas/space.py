import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SpaceUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SpaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    created_by: uuid.UUID
    created_at: datetime
