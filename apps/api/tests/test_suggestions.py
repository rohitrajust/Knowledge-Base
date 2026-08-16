from tests.conftest import login_as


async def _make_space(client) -> str:
    return (await client.post("/api/v1/spaces", json={"name": "Suggestions Space"})).json()["id"]


async def test_similar_items_rank_above_dissimilar(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)

    cake = await client.post(
        f"/api/v1/spaces/{space_id}/items",
        json={"kind": "note", "title": "Chocolate cake recipe", "body": "Mix flour, sugar, cocoa, eggs, butter."},
    )
    frosting = await client.post(
        f"/api/v1/spaces/{space_id}/items",
        json={"kind": "note", "title": "Vanilla frosting recipe", "body": "Cream butter and powdered sugar."},
    )
    budget = await client.post(
        f"/api/v1/spaces/{space_id}/items",
        json={"kind": "note", "title": "Quarterly budget report", "body": "Revenue increased this quarter."},
    )

    response = await client.get(f"/api/v1/spaces/{space_id}/items/{cake.json()['id']}/suggested-links")
    assert response.status_code == 200
    results = response.json()
    assert [r["item"]["id"] for r in results] == [frosting.json()["id"], budget.json()["id"]]
    assert results[0]["score"] > results[1]["score"]


async def test_item_never_suggests_itself(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    item = await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Only item"})

    response = await client.get(f"/api/v1/spaces/{space_id}/items/{item.json()['id']}/suggested-links")
    assert response.json() == []


async def test_already_linked_item_excluded(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    a = await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Item A"})
    b = await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Item B"})
    a_id, b_id = a.json()["id"], b.json()["id"]

    before = await client.get(f"/api/v1/spaces/{space_id}/items/{a_id}/suggested-links")
    assert b_id in {r["item"]["id"] for r in before.json()}

    await client.post(f"/api/v1/spaces/{space_id}/items/{a_id}/links", json={"other_item_id": b_id})

    after = await client.get(f"/api/v1/spaces/{space_id}/items/{a_id}/suggested-links")
    assert b_id not in {r["item"]["id"] for r in after.json()}


async def test_limit_respected(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    subject = await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Subject"})
    for i in range(7):
        await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": f"Candidate {i}"})

    response = await client.get(f"/api/v1/spaces/{space_id}/items/{subject.json()['id']}/suggested-links")
    assert len(response.json()) == 5


async def test_nonexistent_item_is_404(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    response = await client.get(
        f"/api/v1/spaces/{space_id}/items/00000000-0000-0000-0000-000000000000/suggested-links"
    )
    assert response.status_code == 404
