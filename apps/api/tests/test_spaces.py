from tests.conftest import login_as


async def test_create_and_list_space(client):
    await login_as(client, "alice@mnemo.dev")

    create_response = await client.post("/api/v1/spaces", json={"name": "Demo Space"})
    assert create_response.status_code == 201
    space = create_response.json()
    assert space["name"] == "Demo Space"
    assert space["slug"].startswith("demo-space-")

    list_response = await client.get("/api/v1/spaces")
    assert list_response.status_code == 200
    assert [s["id"] for s in list_response.json()] == [space["id"]]


async def test_get_space_detail(client):
    await login_as(client, "alice@mnemo.dev")
    create_response = await client.post("/api/v1/spaces", json={"name": "Demo Space"})
    space_id = create_response.json()["id"]

    detail_response = await client.get(f"/api/v1/spaces/{space_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == space_id


async def test_rename_space(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]
    original_slug = (await client.get(f"/api/v1/spaces/{space_id}")).json()["slug"]

    response = await client.patch(f"/api/v1/spaces/{space_id}", json={"name": "Renamed Space"})
    assert response.status_code == 200
    renamed = response.json()
    assert renamed["name"] == "Renamed Space"
    assert renamed["slug"] == original_slug  # slug stays stable on rename


async def test_non_owner_cannot_rename(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]
    await client.post(f"/api/v1/spaces/{space_id}/members", json={"email": "bob@mnemo.dev"})

    await login_as(client, "bob@mnemo.dev")
    response = await client.patch(f"/api/v1/spaces/{space_id}", json={"name": "Hijacked"})
    assert response.status_code == 403


async def test_delete_space_cascades(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]
    await client.post(
        f"/api/v1/spaces/{space_id}/items",
        json={"kind": "note", "title": "Note", "body": "Body"},
    )

    response = await client.delete(f"/api/v1/spaces/{space_id}")
    assert response.status_code == 204

    # The space (and, via ON DELETE CASCADE, its items/memberships) is gone -- even
    # the owner who deleted it gets 404 now, since get_current_space checks
    # membership first, and the membership row is gone too.
    assert (await client.get(f"/api/v1/spaces/{space_id}")).status_code == 404
    assert (await client.get("/api/v1/spaces")).json() == []


async def test_non_owner_cannot_delete(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]
    await client.post(f"/api/v1/spaces/{space_id}/members", json={"email": "bob@mnemo.dev"})

    await login_as(client, "bob@mnemo.dev")
    response = await client.delete(f"/api/v1/spaces/{space_id}")
    assert response.status_code == 403


async def test_non_member_gets_404_on_rename_and_delete(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]

    await login_as(client, "carol@mnemo.dev")
    assert (await client.patch(f"/api/v1/spaces/{space_id}", json={"name": "X"})).status_code == 404
    assert (await client.delete(f"/api/v1/spaces/{space_id}")).status_code == 404


async def test_invite_and_list_members(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]

    invite_response = await client.post(f"/api/v1/spaces/{space_id}/members", json={"email": "bob@mnemo.dev"})
    assert invite_response.status_code == 201
    assert invite_response.json()["user"]["email"] == "bob@mnemo.dev"
    assert invite_response.json()["role"] == "member"

    members_response = await client.get(f"/api/v1/spaces/{space_id}/members")
    assert members_response.status_code == 200
    emails = {m["user"]["email"] for m in members_response.json()}
    assert emails == {"alice@mnemo.dev", "bob@mnemo.dev"}


async def test_non_owner_cannot_invite(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]
    await client.post(f"/api/v1/spaces/{space_id}/members", json={"email": "bob@mnemo.dev"})

    bob_client = client
    await login_as(bob_client, "bob@mnemo.dev")
    response = await bob_client.post(f"/api/v1/spaces/{space_id}/members", json={"email": "carol@mnemo.dev"})
    assert response.status_code == 403


async def test_remove_member(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]
    bob_id = (await client.post(f"/api/v1/spaces/{space_id}/members", json={"email": "bob@mnemo.dev"})).json()[
        "user_id"
    ]

    remove_response = await client.delete(f"/api/v1/spaces/{space_id}/members/{bob_id}")
    assert remove_response.status_code == 204

    members_response = await client.get(f"/api/v1/spaces/{space_id}/members")
    emails = {m["user"]["email"] for m in members_response.json()}
    assert emails == {"alice@mnemo.dev"}


async def test_cannot_remove_sole_owner(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Demo Space"})).json()["id"]
    me_response = await client.get("/api/v1/auth/me")
    alice_id = me_response.json()["user"]["id"]

    response = await client.delete(f"/api/v1/spaces/{space_id}/members/{alice_id}")
    assert response.status_code == 403
