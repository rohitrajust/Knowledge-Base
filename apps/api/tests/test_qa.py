from unittest.mock import AsyncMock, patch

from tests.conftest import login_as


async def test_ask_returns_grounded_answer_and_sources(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "QA Space"})).json()["id"]
    item = (
        await client.post(
            f"/api/v1/spaces/{space_id}/items",
            json={"kind": "note", "title": "Deployment process", "body": "We deploy via GitHub Actions."},
        )
    ).json()

    with patch("app.api.v1.qa.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "You deploy via GitHub Actions. [1]"
        response = await client.post(
            f"/api/v1/spaces/{space_id}/ask", json={"question": "How do we deploy?"}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "You deploy via GitHub Actions. [1]"
    assert [s["item"]["id"] for s in body["sources"]] == [item["id"]]
    mock_generate.assert_awaited_once()


async def test_ask_on_empty_space_skips_llm_call(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Empty QA Space"})).json()["id"]

    with patch("app.api.v1.qa.generate_completion", new_callable=AsyncMock) as mock_generate:
        response = await client.post(f"/api/v1/spaces/{space_id}/ask", json={"question": "Anything?"})

    assert response.status_code == 200
    body = response.json()
    assert body["sources"] == []
    assert "don't have any relevant information" in body["answer"]
    mock_generate.assert_not_awaited()


async def test_ask_surfaces_upstream_failure_as_502(client):
    from app.core.errors import UpstreamError

    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "QA Space"})).json()["id"]
    await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Something"})

    with patch("app.api.v1.qa.generate_completion", new_callable=AsyncMock) as mock_generate:
        mock_generate.side_effect = UpstreamError("The AI service is temporarily unavailable. Please try again.")
        response = await client.post(f"/api/v1/spaces/{space_id}/ask", json={"question": "What is it?"})

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "upstream_error"
