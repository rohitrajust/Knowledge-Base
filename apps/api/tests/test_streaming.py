"""The NDJSON streaming transports for /ask and conversation messages.

These verify the event contract (sources -> delta* -> done, error on upstream
failure) and, critically, that persistence behaves exactly like the buffered paths:
the user turn survives upstream failures, and the assistant turn lands with its
sources once the stream completes. Prompt assembly itself is covered by test_qa.py /
test_conversations.py -- the streams build prompts through the same code.
"""

import json
from collections.abc import AsyncIterator
from unittest.mock import patch

from app.core.errors import UpstreamError
from tests.conftest import login_as


def _events(raw: str) -> list[dict]:
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


async def _stream(chunks: list[str]) -> AsyncIterator[str]:
    for chunk in chunks:
        yield chunk


async def _make_space_with_item(client) -> tuple[str, str]:
    space_id = (await client.post("/api/v1/spaces", json={"name": "Stream Space"})).json()["id"]
    item = (
        await client.post(
            f"/api/v1/spaces/{space_id}/items",
            json={"kind": "note", "title": "Deployment process", "body": "We deploy via GitHub Actions."},
        )
    ).json()
    return space_id, item["id"]


async def test_ask_stream_emits_sources_deltas_done(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, item_id = await _make_space_with_item(client)

    with patch("app.api.v1.qa.generate_completion_stream") as mock_stream:
        mock_stream.return_value = _stream(["You deploy via", " GitHub Actions. [1]"])
        response = await client.post(f"/api/v1/spaces/{space_id}/ask/stream", json={"question": "How do we deploy?"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/x-ndjson"
    events = _events(response.text)
    assert [e["type"] for e in events] == ["sources", "delta", "delta", "done"]
    assert events[0]["sources"][0]["item"]["id"] == item_id
    assert "".join(e["text"] for e in events if e["type"] == "delta") == "You deploy via GitHub Actions. [1]"
    assert events[-1] == {"type": "done"}
    mock_stream.assert_called_once()


async def test_ask_stream_empty_space_skips_llm(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Empty Stream Space"})).json()["id"]

    with patch("app.api.v1.qa.generate_completion_stream") as mock_stream:
        response = await client.post(f"/api/v1/spaces/{space_id}/ask/stream", json={"question": "Anything?"})

    assert response.status_code == 200
    events = _events(response.text)
    assert events[0] == {"type": "sources", "sources": []}
    fallback = [e for e in events if e["type"] == "delta"]
    assert len(fallback) == 1 and "don't have any relevant information" in fallback[0]["text"]
    assert events[-1] == {"type": "done"}
    mock_stream.assert_not_called()


async def test_conversation_stream_persists_user_and_assistant_messages(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, _item_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion_stream") as mock_stream:
        mock_stream.return_value = _stream(["You deploy via GitHub Actions.", " [1]"])
        response = await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages/stream",
            json={"question": "How do we deploy?"},
        )

    assert response.status_code == 200
    events = _events(response.text)
    assert [e["type"] for e in events][0] == "sources"
    assert events[-1]["type"] == "done"
    done_message = events[-1]["message"]
    assert done_message["role"] == "assistant"
    assert done_message["content"] == "You deploy via GitHub Actions. [1]"
    assert done_message["sources"][0]["title"] == "Deployment process"

    detail = await client.get(f"/api/v1/spaces/{space_id}/conversations/{conversation_id}")
    messages = detail.json()["messages"]
    assert [(m["role"], m["content"]) for m in messages] == [
        ("user", "How do we deploy?"),
        ("assistant", "You deploy via GitHub Actions. [1]"),
    ]
    assert messages[1]["sources"][0]["title"] == "Deployment process"


async def test_conversation_stream_upstream_failure_keeps_user_message_only(client):
    """A mid-stream provider failure must surface as one error event -- and must not
    lose the user's question, which was persisted before generation started."""
    await login_as(client, "alice@mnemo.dev")
    space_id, _item_id = await _make_space_with_item(client)
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    async def _broken_stream(chunks):
        yield "partial ans"
        raise UpstreamError("The AI service is temporarily unavailable. Please try again.")
        yield "never reached"  # pragma: no cover

    with patch("app.api.v1.conversations.generate_completion_stream") as mock_stream:
        mock_stream.return_value = _broken_stream([])
        response = await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages/stream",
            json={"question": "How do we deploy?"},
        )

    assert response.status_code == 200
    events = _events(response.text)
    assert events[-1]["type"] == "error"
    assert events[-1]["error"]["code"] == "upstream_error"
    assert not any(e["type"] == "done" for e in events)

    detail = await client.get(f"/api/v1/spaces/{space_id}/conversations/{conversation_id}")
    messages = detail.json()["messages"]
    assert [(m["role"], m["content"]) for m in messages] == [("user", "How do we deploy?")]


async def test_conversation_stream_empty_space_persists_fallback_answer(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Empty Conv Stream"})).json()["id"]
    conversation_id = (await client.post(f"/api/v1/spaces/{space_id}/conversations", json={})).json()["id"]

    with patch("app.api.v1.conversations.generate_completion_stream") as mock_stream:
        response = await client.post(
            f"/api/v1/spaces/{space_id}/conversations/{conversation_id}/messages/stream",
            json={"question": "Anything?"},
        )

    events = _events(response.text)
    assert events[0] == {"type": "sources", "sources": []}
    assert events[-1]["type"] == "done"
    assert "don't have any relevant information" in events[-1]["message"]["content"]
    mock_stream.assert_not_called()