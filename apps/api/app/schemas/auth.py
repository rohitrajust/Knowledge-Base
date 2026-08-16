from pydantic import BaseModel, EmailStr, Field

from app.schemas.space import SpaceOut
from app.schemas.user import UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class SignupRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class MeOut(BaseModel):
    user: UserOut
    spaces: list[SpaceOut]
