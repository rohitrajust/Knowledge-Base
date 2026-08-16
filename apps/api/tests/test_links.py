from tests.conftest import login_as


async def _make_space_with_items(client, count: int = 2) -> tuple[str, list[str]]:
    space_id = (await client.post("/api/v1/spaces", json={"name": "Links Space"})).json()["id"]
    item_ids = []
    for i in range(count):
        item = (
            await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": f"Item {i}"})
        ).json()
        item_ids.append(item["id"])
    return space_id, item_ids


async def test_create_and_list_link_from_both_sides(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)

    create_response = await client.post(
        f"/api/v1/spaces/{space_id}/items/{item_a}/links", json={"other_item_id": item_b}
    )
    assert create_response.status_code == 201
    assert create_response.json()["item"]["id"] == item_b

    from_a = await client.get(f"/api/v1/spaces/{space_id}/items/{item_a}/links")
    assert [link["item"]["id"] for link in from_a.json()] == [item_b]

    from_b = await client.get(f"/api/v1/spaces/{space_id}/items/{item_b}/links")
    assert [link["item"]["id"] for link in from_b.json()] == [item_a]


async def test_duplicate_link_rejected_in_either_direction(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)

    first = await client.post(f"/api/v1/spaces/{space_id}/items/{item_a}/links", json={"other_item_id": item_b})
    assert first.status_code == 201

    same_direction = await client.post(
        f"/api/v1/spaces/{space_id}/items/{item_a}/links", json={"other_item_id": item_b}
    )
    assert same_direction.status_code == 400

    reverse_direction = await client.post(
        f"/api/v1/spaces/{space_id}/items/{item_b}/links", json={"other_item_id": item_a}
    )
    assert reverse_direction.status_code == 400


async def test_self_link_rejected(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, _) = await _make_space_with_items(client)

    response = await client.post(f"/api/v1/spaces/{space_id}/items/{item_a}/links", json={"other_item_id": item_a})
    assert response.status_code == 400


async def test_link_to_item_in_another_space_rejected(client):
    await login_as(client, "alice@mnemo.dev")
    space1, (item_a,) = await _make_space_with_items(client, count=1)
    space2, (item_x,) = await _make_space_with_items(client, count=1)

    response = await client.post(f"/api/v1/spaces/{space1}/items/{item_a}/links", json={"other_item_id": item_x})
    assert response.status_code == 404


async def test_delete_link(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)
    link = (
        await client.post(f"/api/v1/spaces/{space_id}/items/{item_a}/links", json={"other_item_id": item_b})
    ).json()

    delete_response = await client.delete(
        f"/api/v1/spaces/{space_id}/items/{item_a}/links/{link['link_id']}"
    )
    assert delete_response.status_code == 204

    listing = await client.get(f"/api/v1/spaces/{space_id}/items/{item_a}/links")
    assert listing.json() == []
