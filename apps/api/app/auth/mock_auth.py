"""Mock authentication: real bcrypt password hashing, but no external identity
provider -- anyone can self-serve signup. Swapping this for a real IdP later means
replacing only this module -- `sessions`, `get_current_user`, and `get_current_space`
(app/auth/dependencies.py) are unaffected.
"""

import uuid

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

# Pre-existing dev/test accounts (see app/seed.py and tests/conftest.py) -- not the
# only way to get an account anymore now that signup exists, just convenient fixtures.
SEEDED_USERS = [
    {"email": "alice@mnemo.dev", "display_name": "Alice"},
    {"email": "bob@mnemo.dev", "display_name": "Bob"},
    {"email": "carol@mnemo.dev", "display_name": "Carol"},
]
# Shared password for the seeded accounts above -- defined once here so app/seed.py,
# the migration backfill, and tests/conftest.py never risk drifting out of sync.
DEV_SEED_PASSWORD = "mnemo-dev-password"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


async def find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, email: str, display_name: str, password: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        display_name=display_name,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.flush()
    return user
