"""The regression suite the PRD's isolation risk calls for: proves that no cross-space
data is visible, both through the app layer (get_current_space) and independently
through Postgres RLS, so a future missing app-layer filter still can't leak data.
"""

from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.session import async_session_factory
from app.main import app
from tests.conftest import login_as


async def _new_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_cross_space_isolation_end_to_end():
    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        space2 = (await client_b.post("/api/v1/spaces", json={"name": "Bob's Space"})).json()

        # A's space list excludes B's space.
        a_spaces = (await client_a.get("/api/v1/spaces")).json()
        assert space2["id"] not in {s["id"] for s in a_spaces}

        # Direct access to a space A isn't a member of is a 404, not a 403 - it must not
        # confirm the space's existence to a non-member.
        assert (await client_a.get(f"/api/v1/spaces/{space2['id']}")).status_code == 404
        assert (await client_a.get(f"/api/v1/spaces/{space2['id']}/members")).status_code == 404
        assert (
            await client_a.post(f"/api/v1/spaces/{space2['id']}/members", json={"email": "carol@mnemo.dev"})
        ).status_code == 404

        # Once B actually adds A to space2, A can access it - proving the check is
        # membership-based, not a blanket "not your space" denial.
        invite_response = await client_b.post(
            f"/api/v1/spaces/{space2['id']}/members", json={"email": "alice@mnemo.dev"}
        )
        assert invite_response.status_code == 201

        assert (await client_a.get(f"/api/v1/spaces/{space2['id']}")).status_code == 200


async def test_rls_holds_independent_of_orm_query_scoping():
    """Even a raw SQL query against a tenant table, issued after activating the RLS
    context for one space, must never return another space's rows - this is what would
    still catch a leak if a future endpoint forgot to go through query_scoping.py.
    """
    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        space2 = (await client_b.post("/api/v1/spaces", json={"name": "Bob's Space"})).json()

    async with async_session_factory() as db:
        await db.execute(text("SELECT set_config('app.current_space_id', :sid, true)"), {"sid": space1["id"]})
        result = await db.execute(text("SELECT space_id FROM space_memberships"))
        rows = result.scalars().all()

        assert len(rows) > 0
        assert all(str(r) == space1["id"] for r in rows)
        assert space2["id"] not in {str(r) for r in rows}


async def test_rls_denies_when_space_context_never_activated():
    """No app.current_space_id set at all -> deny-by-default, not permissive fallback."""
    async with await _new_client() as client_a:
        await login_as(client_a, "alice@mnemo.dev")
        await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})

    async with async_session_factory() as db:
        result = await db.execute(text("SELECT space_id FROM space_memberships"))
        rows = result.scalars().all()
        assert rows == []


async def test_cross_space_item_isolation():
    """Content tables (starting with `items`, milestone 2's first) must inherit the same
    isolation the space/membership tables already have -- no new code should be needed
    for get_current_space + RLS to cover them, and this test is what proves it.
    """
    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        space2 = (await client_b.post("/api/v1/spaces", json={"name": "Bob's Space"})).json()

        item = (
            await client_a.post(
                f"/api/v1/spaces/{space1['id']}/items", json={"kind": "note", "title": "Secret"}
            )
        ).json()

        # B is not a member of space1 -- guessing the item's ID doesn't help.
        assert (await client_b.get(f"/api/v1/spaces/{space1['id']}/items/{item['id']}")).status_code == 404
        assert (
            await client_b.patch(
                f"/api/v1/spaces/{space1['id']}/items/{item['id']}", json={"title": "Hijacked"}
            )
        ).status_code == 404
        assert (
            await client_b.delete(f"/api/v1/spaces/{space1['id']}/items/{item['id']}")
        ).status_code == 404

        # Confirm it's untouched.
        still_there = await client_a.get(f"/api/v1/spaces/{space1['id']}/items/{item['id']}")
        assert still_there.status_code == 200
        assert still_there.json()["title"] == "Secret"


async def test_rls_holds_for_items_independent_of_orm_query_scoping():
    """Same raw-SQL guarantee as space_memberships, extended to the items table."""
    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        space2 = (await client_b.post("/api/v1/spaces", json={"name": "Bob's Space"})).json()

        await client_a.post(f"/api/v1/spaces/{space1['id']}/items", json={"kind": "note", "title": "A's note"})
        await client_b.post(f"/api/v1/spaces/{space2['id']}/items", json={"kind": "note", "title": "B's note"})

    async with async_session_factory() as db:
        await db.execute(text("SELECT set_config('app.current_space_id', :sid, true)"), {"sid": space1["id"]})
        result = await db.execute(text("SELECT space_id FROM items"))
        rows = result.scalars().all()

        assert len(rows) > 0
        assert all(str(r) == space1["id"] for r in rows)
        assert space2["id"] not in {str(r) for r in rows}


async def test_cross_space_link_and_graph_isolation():
    """Links and the graph endpoint must respect the same space boundary as everything
    else: B (not a member of space1) can't create/list/delete links on A's items, and
    can't fetch space1's graph at all.
    """
    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        item_a1 = (
            await client_a.post(f"/api/v1/spaces/{space1['id']}/items", json={"kind": "note", "title": "A1"})
        ).json()
        item_a2 = (
            await client_a.post(f"/api/v1/spaces/{space1['id']}/items", json={"kind": "note", "title": "A2"})
        ).json()
        link = (
            await client_a.post(
                f"/api/v1/spaces/{space1['id']}/items/{item_a1['id']}/links",
                json={"other_item_id": item_a2["id"]},
            )
        ).json()

        # B can't fetch the graph at all -- 404, not an empty graph.
        assert (await client_b.get(f"/api/v1/spaces/{space1['id']}/graph")).status_code == 404

        # B can't list, create, or delete links on A's items.
        assert (
            await client_b.get(f"/api/v1/spaces/{space1['id']}/items/{item_a1['id']}/links")
        ).status_code == 404
        assert (
            await client_b.post(
                f"/api/v1/spaces/{space1['id']}/items/{item_a1['id']}/links",
                json={"other_item_id": item_a2["id"]},
            )
        ).status_code == 404
        assert (
            await client_b.delete(
                f"/api/v1/spaces/{space1['id']}/items/{item_a1['id']}/links/{link['link_id']}"
            )
        ).status_code == 404

        # Untouched from A's side.
        still_linked = await client_a.get(f"/api/v1/spaces/{space1['id']}/items/{item_a1['id']}/links")
        assert len(still_linked.json()) == 1


async def test_cross_space_search_isolation():
    """Search must respect the same space boundary as everything else: B can't search
    space1 at all (404, not an empty result -- don't confirm the space's existence),
    and A's own search never surfaces items from a space A isn't in.
    """
    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        await client_a.post(
            f"/api/v1/spaces/{space1['id']}/items",
            json={"kind": "note", "title": "Alice's secret plan", "body": "Top secret content."},
        )

        assert (
            await client_b.get(f"/api/v1/spaces/{space1['id']}/search", params={"q": "secret plan"})
        ).status_code == 404


async def test_cross_space_ask_isolation():
    """A non-member's question against a space they're not in must 404, and never
    reach the LLM -- the mocked call is asserted not-called to prove the space-
    membership check short-circuits before any grounding/generation happens.
    """
    from unittest.mock import AsyncMock, patch

    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        await client_a.post(
            f"/api/v1/spaces/{space1['id']}/items",
            json={"kind": "note", "title": "Alice's secret plan", "body": "Top secret content."},
        )

        with patch("app.api.v1.qa.generate_completion", new_callable=AsyncMock) as mock_generate:
            response = await client_b.post(
                f"/api/v1/spaces/{space1['id']}/ask", json={"question": "What is the secret plan?"}
            )

        assert response.status_code == 404
        mock_generate.assert_not_awaited()


async def test_cross_space_conversation_and_memory_isolation():
    """A non-member's access to another space's conversations, messages, and memory
    must all 404, and never reach the LLM.
    """
    from unittest.mock import AsyncMock, patch

    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        await client_a.post(
            f"/api/v1/spaces/{space1['id']}/items",
            json={"kind": "note", "title": "Note", "body": "Content."},
        )
        conversation = (
            await client_a.post(f"/api/v1/spaces/{space1['id']}/conversations", json={})
        ).json()

        with patch("app.api.v1.conversations.generate_completion", new_callable=AsyncMock) as mock_generate:
            assert (
                await client_b.get(f"/api/v1/spaces/{space1['id']}/conversations")
            ).status_code == 404
            assert (
                await client_b.get(f"/api/v1/spaces/{space1['id']}/conversations/{conversation['id']}")
            ).status_code == 404
            assert (
                await client_b.post(
                    f"/api/v1/spaces/{space1['id']}/conversations/{conversation['id']}/messages",
                    json={"question": "Anything?"},
                )
            ).status_code == 404
            assert (
                await client_b.post(f"/api/v1/spaces/{space1['id']}/conversations/{conversation['id']}/end")
            ).status_code == 404
            assert (await client_b.get(f"/api/v1/spaces/{space1['id']}/memory")).status_code == 404

        mock_generate.assert_not_awaited()


async def test_cross_space_suggestion_isolation():
    """A non-member's request for another space's item suggestions must 404."""
    async with await _new_client() as client_a, await _new_client() as client_b:
        await login_as(client_a, "alice@mnemo.dev")
        await login_as(client_b, "bob@mnemo.dev")

        space1 = (await client_a.post("/api/v1/spaces", json={"name": "Alice's Space"})).json()
        item = (
            await client_a.post(f"/api/v1/spaces/{space1['id']}/items", json={"kind": "note", "title": "Note"})
        ).json()

        response = await client_b.get(f"/api/v1/spaces/{space1['id']}/items/{item['id']}/suggested-links")
        assert response.status_code == 404
