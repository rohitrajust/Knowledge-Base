"""Idempotent seed script. Run with: uv run python -m app.seed"""

import asyncio

from sqlalchemy import select

from app.auth.mock_auth import DEV_SEED_PASSWORD, SEEDED_USERS, hash_password
from app.core.logging import configure_logging, get_logger
from app.db.session import async_session_factory
from app.models.user import User

logger = get_logger(__name__)


async def seed_users() -> None:
    async with async_session_factory() as db:
        for entry in SEEDED_USERS:
            result = await db.execute(select(User).where(User.email == entry["email"]))
            if result.scalar_one_or_none() is not None:
                continue
            db.add(
                User(
                    email=entry["email"],
                    display_name=entry["display_name"],
                    password_hash=hash_password(DEV_SEED_PASSWORD),
                )
            )
            logger.info("seeded_user", email=entry["email"])
        await db.commit()


async def main() -> None:
    configure_logging()
    await seed_users()


if __name__ == "__main__":
    asyncio.run(main())
