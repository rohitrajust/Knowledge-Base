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


async def test_link_defaults_to_related_and_undirected(client):
    """Existing clients POST without a relation; they must keep working unchanged."""
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)

    created = (
        await client.post(f"/api/v1/spaces/{space_id}/items/{item_a}/links", json={"other_item_id": item_b})
    ).json()
    assert created["relation"] == "related"
    assert created["direction_out"] == "none"

    from_b = (await client.get(f"/api/v1/spaces/{space_id}/items/{item_b}/links")).json()
    assert from_b[0]["relation"] == "related"
    assert from_b[0]["direction_out"] == "none"


async def test_directed_relation_reads_correctly_from_both_ends(client):
    """The link is created *from* item_a, so item_a sees it as outgoing and item_b as
    incoming -- regardless of which of them canonical ordering put in item_a_id."""
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)

    created = (
        await client.post(
            f"/api/v1/spaces/{space_id}/items/{item_a}/links",
            json={"other_item_id": item_b, "relation": "supersedes"},
        )
    ).json()
    assert created["relation"] == "supersedes"
    assert created["direction_out"] == "out"

    from_b = (await client.get(f"/api/v1/spaces/{space_id}/items/{item_b}/links")).json()
    assert from_b[0]["direction_out"] == "in"


async def test_directed_relation_created_from_either_end_points_the_right_way(client):
    """Covers the b_to_a storage path: creating the link from the item that sorts
    *second* must still record that item as the relation's source."""
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)
    first, second = sorted([item_a, item_b])

    await client.post(
        f"/api/v1/spaces/{space_id}/items/{second}/links",
        json={"other_item_id": first, "relation": "depends_on"},
    )

    graph = (await client.get(f"/api/v1/spaces/{space_id}/graph")).json()
    edge = graph["edges"][0]
    assert edge["relation"] == "depends_on"
    assert edge["directed"] is True
    assert edge["source"] == second
    assert edge["target"] == first


async def test_graph_edge_for_undirected_relation_is_not_directed(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)
    await client.post(f"/api/v1/spaces/{space_id}/items/{item_a}/links", json={"other_item_id": item_b})

    edge = (await client.get(f"/api/v1/spaces/{space_id}/graph")).json()["edges"][0]
    assert edge["relation"] == "related"
    assert edge["directed"] is False


async def test_patch_retypes_link_and_recomputes_direction(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)
    link = (
        await client.post(f"/api/v1/spaces/{space_id}/items/{item_a}/links", json={"other_item_id": item_b})
    ).json()

    patched = await client.patch(
        f"/api/v1/spaces/{space_id}/items/{item_a}/links/{link['link_id']}",
        json={"relation": "references"},
    )
    assert patched.status_code == 200
    assert patched.json()["relation"] == "references"
    assert patched.json()["direction_out"] == "out"

    # Re-issuing the PATCH from the other endpoint flips the direction.
    reflipped = await client.patch(
        f"/api/v1/spaces/{space_id}/items/{item_b}/links/{link['link_id']}",
        json={"relation": "references"},
    )
    assert reflipped.json()["direction_out"] == "out"

    from_a = (await client.get(f"/api/v1/spaces/{space_id}/items/{item_a}/links")).json()
    assert from_a[0]["direction_out"] == "in"


async def test_patch_back_to_undirected_clears_direction(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)
    link = (
        await client.post(
            f"/api/v1/spaces/{space_id}/items/{item_a}/links",
            json={"other_item_id": item_b, "relation": "part_of"},
        )
    ).json()

    patched = await client.patch(
        f"/api/v1/spaces/{space_id}/items/{item_a}/links/{link['link_id']}",
        json={"relation": "related"},
    )
    assert patched.json()["direction_out"] == "none"
    assert (await client.get(f"/api/v1/spaces/{space_id}/graph")).json()["edges"][0]["directed"] is False


async def test_unknown_relation_rejected(client):
    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, item_b) = await _make_space_with_items(client)

    response = await client.post(
        f"/api/v1/spaces/{space_id}/items/{item_a}/links",
        json={"other_item_id": item_b, "relation": "invented_by"},
    )
    assert response.status_code == 422


async def test_patch_unknown_link_returns_404(client):
    import uuid as _uuid

    await login_as(client, "alice@mnemo.dev")
    space_id, (item_a, _) = await _make_space_with_items(client)

    response = await client.patch(
        f"/api/v1/spaces/{space_id}/items/{item_a}/links/{_uuid.uuid4()}",
        json={"relation": "references"},
    )
    assert response.status_code == 404
