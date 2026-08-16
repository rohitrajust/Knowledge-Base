import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://mnemo_app@localhost/mnemo_test")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.auth.mock_auth import DEV_SEED_PASSWORD, SEEDED_USERS, hash_password
from app.db.session import async_session_factory, engine
from app.main import app
from app.models.user import User

# Content tables reset between tests; `users` is seeded once per session (see
# seed_users below) so seeded-account logins keep working across tests.
CONTENT_TABLES = ["sessions", "messages", "memory_summaries", "conversations", "item_links", "items", "space_memberships", "spaces"]


@pytest_asyncio.fixture(scope="session", autouse=True)
async def seed_users():
    async with async_session_factory() as db:
        for entry in SEEDED_USERS:
            result = await db.execute(select(User).where(User.email == entry["email"]))
            if result.scalar_one_or_none() is None:
                db.add(
                    User(
                        email=entry["email"],
                        display_name=entry["display_name"],
                        password_hash=hash_password(DEV_SEED_PASSWORD),
                    )
                )
        await db.commit()
    yield
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {', '.join(CONTENT_TABLES)} RESTART IDENTITY CASCADE"))
    yield


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db():
    async with async_session_factory() as session:
        yield session


async def login_as(client: AsyncClient, email: str, password: str = DEV_SEED_PASSWORD) -> AsyncClient:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return client
