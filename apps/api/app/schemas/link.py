import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.item import ItemOut


class LinkCreate(BaseModel):
    other_item_id: uuid.UUID


class LinkedItemOut(BaseModel):
    link_id: uuid.UUID
    created_at: datetime
    item: ItemOut
