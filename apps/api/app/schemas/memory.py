import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MemoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    space_id: uuid.UUID
    conversation_id: uuid.UUID | None
    content: str
    created_at: datetime
    expires_at: datetime
