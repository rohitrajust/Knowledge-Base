import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.user import UserOut


class MemberInvite(BaseModel):
    email: EmailStr


class MembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    space_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    created_at: datetime
    user: UserOut
