import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import text

from app.core.prompting import MAX_HISTORY_MESSAGES, NO_MEMORY_SENTINEL
from app.models.message import Message
from tests.conftest import login_as


async def _make_space_with_item(client) -> tuple[str, str]:
    space_id = (await client.post("/api/v1/spaces", json={"name": "Conv Space"})).json()["id"]
    await client.post(
        f"/api/v1/spaces/{space_id}/items",
        json={"kind": "note", "title": "Deployment process", "body": "We deploy via GitHub Actions."},
    )
    return space_id


async def test_create_list_get_conversation(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Conv Space"})).json()["id"]

    create_response = await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})
    assert create_response.status_code == 201
    conversation = create_response.json()
    assert conversation["title"] == "New conversation"

    listing = await client.get(f"/api/v1/spaces/{space_id}/conversations")
    assert [c["id"] for c in listing.json()] == [conversation["id"]]

    detail = await client.get(f"/api/v1/spaces/{space_id}/conversations/{conversation['id']}")
    assert detail.status_code == 200
    assert detail.json()["messages"] == []


async def test_post_message_returns_grounded_answer_with_sources(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "You deploy via GitHub Actions. [1]"
        response = await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "How do we deploy?"},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "assistant"
    assert body["content"] == "You deploy via GitHub Actions. [1]"
    assert body["sources"][0]["title"] == "Deployment process"
    mock_generate.assert_awaited_once()


async def test_multi_turn_context_includes_prior_messages(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "First answer."
        await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "How do we deploy the API?"},
        )

        mock_generate.return_value = "Second answer."
        await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "What about rollbacks?"},
        )

        second_call_messages = mock_generate.await_args_list[1].args[0]
        joined = "\n".join(m["content"] for m in second_call_messages)
        assert "How do we deploy the API?" in joined
        assert "First answer." in joined
        assert "What about rollbacks?" in joined


async def test_conversation_history_sent_to_llm_is_bounded(client, db):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    # Seed more than MAX_HISTORY_MESSAGES prior messages directly (bypassing the API to
    # avoid 25 real mocked round trips), activating RLS the same way test_isolation.py's
    # raw-SQL checks do.
    seeded_count = MAX_HISTORY_MESSAGES + 5
    await db.execute(text("SELECT set_config('app.current_space_id', :sid, true)"), {"sid": space_id})
    for i in range(seeded_count):
        db.add(
            Message(
                space_id=space_id,
                conversation_id=conversation_id,
                role="user" if i % 2 == 0 else "assistant",
                content=f"seeded-message-{i}",
            )
        )
    await db.commit()

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "Final answer."
        await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "Newest question"},
        )

    sent_messages = mock_generate.await_args.args[0]
    joined = "\n".join(m["content"] for m in sent_messages)

    # The oldest seeded messages must have been dropped by the bound...
    assert "seeded-message-0" not in joined
    assert "seeded-message-4" not in joined
    # ...but the most recent MAX_HISTORY_MESSAGES should still be present.
    assert f"seeded-message-{seeded_count - 1}" in joined


async def test_end_conversation_creates_memory_with_correct_ttl(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "We deploy via GitHub Actions. [1]"
        await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "How do we deploy?"},
        )

        mock_generate.return_value = "The team deploys the API via GitHub Actions on merge to main."
        end_response = await client.post(f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/end")

    # Ending returns immediately (202); the summary trails in a background task.
    assert end_response.status_code == 202
    assert end_response.json() == {"status": "ending"}

    memory = None
    for _ in range(20):
        listing = await client.get(f"/api/v1/spaces/{space_id}/memory")
        if listing.json():
            memory = listing.json()[0]
            break
        await asyncio.sleep(0.05)
    assert memory is not None, "memory summary never appeared after end_conversation"
    assert "GitHub Actions" in memory["content"]

    created_at = datetime.fromisoformat(memory["created_at"])
    expires_at = datetime.fromisoformat(memory["expires_at"])
    assert abs((expires_at - created_at) - timedelta(days=30)) < timedelta(minutes=1)
    assert [m["id"] for m in listing.json()] == [memory["id"]]


async def test_summarizer_none_sentinel_creates_no_memory(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "Hi there!"
        await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "hey"},
        )

        mock_generate.return_value = NO_MEMORY_SENTINEL
        end_response = await client.post(f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/end")

    assert end_response.status_code == 202
    assert end_response.json() == {"status": "ending"}

    # The summarizer hit the NONE sentinel, so no memory should ever be created; poll
    # briefly to give the background task every chance to (wrongly) write one.
    for _ in range(10):
        await asyncio.sleep(0.02)
    listing = await client.get(f"/api/v1/spaces/{space_id}/memory")
    assert listing.json() == []


async def test_ending_empty_conversation_skips_llm_and_creates_no_memory(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
        end_response = await client.post(f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/end")

    assert end_response.status_code == 202
    assert end_response.json() == {"status": "ending"}

    # No messages means nothing to summarize; give a (wrong) background write time to
    # show up before asserting it never did.
    for _ in range(10):
        await asyncio.sleep(0.02)
    listing = await client.get(f"/api/v1/spaces/{space_id}/memory")
    assert listing.json() == []
    mock_generate.assert_not_awaited()


async def test_delete_conversation_cascades_messages(client, db):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "An answer."
        await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "How do we deploy?"},
        )

    delete_response = await client.delete(f"/api/v1/spaces/{space_id}/conversations/{conversation_id}")
    assert delete_response.status_code == 204

    await db.execute(text("SELECT set_config('app.current_space_id', :sid, true)"), {"sid": space_id})
    result = await db.execute(text("SELECT count(*) FROM messages WHERE conversation_id = :cid"), {"cid": conversation_id})
    assert result.scalar_one() == 0

async def test_post_message_rejects_ended_conversation(client):
    """ended_at is a lock, not a label: neither transport may append to an
    ended conversation even though the UI hides the composer."""
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]
    await client.post(f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/end")

    with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock):
        response = await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"question": "One more?"},
        )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "domain_error"
    assert "ended" in response.json()["error"]["message"]


async def test_stream_rejects_ended_conversation_before_streaming(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]
    await client.post(f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/end")

    with patch("app.api.v1.conversations.generate_completion_stream"):
        response = await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages/stream",
            json={"question": "One more?"},
        )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "domain_error"