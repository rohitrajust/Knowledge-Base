from tests.conftest import login_as


async def _make_space(client) -> str:
    response = await client.post("/api/v1/spaces", json={"name": "Items Space"})
    return response.json()["id"]


async def test_create_note_document_reference(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)

    note = await client.post(
        f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "N", "body": "hello"}
    )
    assert note.status_code == 201
    assert note.json()["kind"] == "note"

    document = await client.post(
        f"/api/v1/spaces/{space_id}/items", json={"kind": "document", "title": "D", "body": "long text"}
    )
    assert document.status_code == 201

    reference = await client.post(
        f"/api/v1/spaces/{space_id}/items",
        json={"kind": "reference", "title": "R", "url": "https://example.com"},
    )
    assert reference.status_code == 201
    assert reference.json()["url"] == "https://example.com"


async def test_reference_requires_url(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)

    response = await client.post(
        f"/api/v1/spaces/{space_id}/items", json={"kind": "reference", "title": "No URL"}
    )
    assert response.status_code == 422


async def test_list_items_ordered_by_updated_at_desc(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)

    first = await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "First"})
    second = await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Second"})

    listing = await client.get(f"/api/v1/spaces/{space_id}/items")
    assert [item["id"] for item in listing.json()] == [second.json()["id"], first.json()["id"]]


async def test_get_nonexistent_item_is_404(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    response = await client.get(f"/api/v1/spaces/{space_id}/items/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_update_item(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    item = (
        await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Old", "body": "v1"})
    ).json()

    response = await client.patch(
        f"/api/v1/spaces/{space_id}/items/{item['id']}", json={"title": "New", "body": "v2"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "New"
    assert body["body"] == "v2"
    assert body["updated_at"] >= body["created_at"]


async def test_delete_item(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    item = (await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Gone"})).json()

    delete_response = await client.delete(f"/api/v1/spaces/{space_id}/items/{item['id']}")
    assert delete_response.status_code == 204

    get_response = await client.get(f"/api/v1/spaces/{space_id}/items/{item['id']}")
    assert get_response.status_code == 404


async def test_any_member_can_edit_and_delete_not_just_owner(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = await _make_space(client)
    await client.post(f"/api/v1/spaces/{space_id}/members", json={"email": "bob@mnemo.dev"})
    item = (await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "Shared"})).json()

    await login_as(client, "bob@mnemo.dev")
    patch_response = await client.patch(f"/api/v1/spaces/{space_id}/items/{item['id']}", json={"title": "Edited by bob"})
    assert patch_response.status_code == 200

    delete_response = await client.delete(f"/api/v1/spaces/{space_id}/items/{item['id']}")
    assert delete_response.status_code == 204
