from tests.conftest import login_as


async def test_empty_space_has_empty_graph(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Empty Space"})).json()["id"]

    response = await client.get(f"/api/v1/spaces/{space_id}/graph")
    assert response.status_code == 200
    assert response.json() == {"nodes": [], "edges": []}


async def test_graph_reflects_items_and_links(client):
    await login_as(client, "alice@mnemo.dev")
    space_id = (await client.post("/api/v1/spaces", json={"name": "Graph Space"})).json()["id"]

    item_a = (await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "A"})).json()
    item_b = (await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "note", "title": "B"})).json()
    item_c = (
        await client.post(f"/api/v1/spaces/{space_id}/items", json={"kind": "document", "title": "C"})
    ).json()

    await client.post(f"/api/v1/spaces/{space_id}/items/{item_a['id']}/links", json={"other_item_id": item_b["id"]})

    response = await client.get(f"/api/v1/spaces/{space_id}/graph")
    body = response.json()

    assert {node["id"] for node in body["nodes"]} == {item_a["id"], item_b["id"], item_c["id"]}
    assert len(body["edges"]) == 1
    assert {body["edges"][0]["source"], body["edges"][0]["target"]} == {item_a["id"], item_b["id"]}
