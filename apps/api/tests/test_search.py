from tests.conftest import login_as


async def test_search_ranks_relevant_item_first(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Search Space"})).json()["id"]

    await client.post(
        f"/api/v1/spaces/{space_id}/items",
        json={
            "kind": "note",
            "title": "Chocolate cake recipe",
            "body": "Mix flour, sugar, cocoa powder, eggs, and butter. Bake at 350F.",
        },
    )
    budget = await client.post(
        f"/api/v1/spaces/{space_id}/items",
        json={
            "kind": "note",
            "title": "Quarterly budget report",
            "body": "Revenue increased this quarter, driven by enterprise sales.",
        },
    )

    response = await client.get(f"/api/v1/spaces/{space_id}/search", params={"q": "company revenue and finances"})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 2
    assert results[0]["item"]["id"] == budget.json()["id"]
    assert results[0]["score"] > results[1]["score"]


async def test_empty_query_returns_empty_list(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Search Space"})).json()["id"]
    await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Something"})

    response = await client.get(f"/api/v1/spaces/{space_id}/search", params={"q": "   "})
    assert response.status_code == 200
    assert response.json() == []


async def test_search_on_empty_space_returns_empty_list(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Empty Space"})).json()["id"]

    response = await client.get(f"/api/v1/spaces/{space_id}/search", params={"q": "anything"})
    assert response.status_code == 200
    assert response.json() == []
