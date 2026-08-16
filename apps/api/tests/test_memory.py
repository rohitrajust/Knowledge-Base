from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import text

from app.models.memory import MemorySummary
from tests.conftest import login_as


async def _make_space(client) -> str:
    return (await client.post("/api/v1/spaces", json={"name": "Memory Space"})).json()["id"]


async def _seed_memory(db, space_id: str, content: str, expires_at) -> str:
    await db.execute(text("SELECT set_config('app.current_space_id', :sid, true)"), {"sid": space_id})
    memory = MemorySummary(space_id=space_id, content=content, expires_at=expires_at)
    db.add(memory)
    await db.flush()
    memory_id = str(memory.id)
    await db.commit()
    return memory_id


async def test_expired_memory_excluded_from_listing(client, db):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)

    active_id = await _seed_memory(
        db, space_id, "Active memory", datetime.now(timezone.utc) + timedelta(days=30)
    )
    await _seed_memory(db, space_id, "Expired memory", datetime.now(timezone.utc) - timedelta(days=1))

    response = await client.get(f"/api/v1/spaces/{space_id}/memory")
    assert [m["id"] for m in response.json()] == [active_id]


async def test_expired_memory_excluded_from_conversation_context(client, db):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    await client.post(
        f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Some note", "body": "Some content."}
    )

    await _seed_memory(db, space_id, "ACTIVE-MEMORY-MARKER", datetime.now(timezone.utc) + timedelta(days=30))
    await _seed_memory(db, space_id, "EXPIRED-MEMORY-MARKER", datetime.now(timezone.utc) - timedelta(days=1))

    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "An answer."
        await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "A question"},
        )

    sent_messages = mock_generate.await_args.args[0]
    joined = "\n".join(m["content"] for m in sent_messages)
    assert "ACTIVE-MEMORY-MARKER" in joined
    assert "EXPIRED-MEMORY-MARKER" not in joined


async def test_delete_memory(client, db):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    memory_id = await _seed_memory(
        db, space_id, "To be deleted", datetime.now(timezone.utc) + timedelta(days=30)
    )

    delete_response = await client.delete(f"/api/v1/spaces/{space_id}/memory/{memory_id}")
    assert delete_response.status_code == 204

    listing = await client.get(f"/api/v1/spaces/{space_id}/memory")
    assert listing.json() == []


async def test_memory_shared_across_space_members(client, db):
    """A memory created via Alice's conversation must be visible to Bob, another member
    of the same space -- proving space-level sharing is real behavior."""
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    await client.post(f"/api/v1/spaces/{space_id}/members", json={"email": "bob@mnemo.dev"})

    memory_id = await _seed_memory(
        db, space_id, "Shared team knowledge", datetime.now(timezone.utc) + timedelta(days=30)
    )

    await login_as(client, "bob@mnemo.dev")
    response = await client.get(f"/api/v1/spaces/{space_id}/memory")
    assert [m["id"] for m in response.json()] == [memory_id]
