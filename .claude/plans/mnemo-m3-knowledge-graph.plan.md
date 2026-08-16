# Plan: Mnemo — Milestone 3: Manual Knowledge Graph

**Source PRD**: `.claude/prds/mnemo.prd.md`
**Selected Milestone**: 3 — Manual knowledge graph
**Complexity**: Medium-Large

## Context
Milestone 2 gave a space a flat list of notes/documents/references. Milestone 3 is where Mnemo's signature feature shows up: users manually connect items into a graph, and can explore that graph visually — nodes that move, cluster, repel, and attract via a physics simulation, with zoom, pan, filtering, and click-to-navigate. This is the first milestone that's mostly new surface area rather than extending the existing CRUD pattern: a new "link between two items" concept on the backend, and a genuinely new frontend capability (canvas-based, physics-driven rendering) that nothing in milestones 1-2 resembles.

**Confirmed decisions** (already agreed with the user, not open for re-litigation in this plan):
- Graph rendering library: `react-force-graph-2d` (Canvas + d3-force under the hood) — matches the PRD's "nodes naturally move, cluster, repel, and attract" requirement out of the box, no custom physics needed.
- Link creation UX: a "Linked items" picker on the item detail page (search/select another item in the space, unlink from a list). The graph page itself is for visualizing and navigating (click a node → open that item), not for drawing connections — that's out of scope for this milestone.
- Link model: undirected, unlabeled. A single row means two items are related, shown identically from either item's side — matches Obsidian's basic link/backlink model. Directed/labeled relationships are deferred (arguably belongs closer to milestone 7, AI-suggested links).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Space-scoped model | `apps/api/app/models/item.py` | `ItemLink(Base, SpaceScopedMixin)` follows the same shape (UUID PK, `space_id` from the mixin, `created_by`, `created_at`). |
| RLS + `NULLIF` guard | `apps/api/app/db/migrations/versions/0003_create_items.py` | `item_links` gets the same `ENABLE`/`FORCE ROW LEVEL SECURITY` + 4 per-command policies keyed on `NULLIF(current_setting('app.current_space_id', true), '')::uuid`. |
| Isolation enforcement | `apps/api/app/auth/dependencies.py:get_current_space` | Every link/graph route depends on it, same as items routes. |
| Query scoping | `apps/api/app/core/query_scoping.py:scoped_select` | Fetching "the other item in a link" or graph nodes goes through `scoped_select(Item, space_id)`, not an ad hoc query. |
| Router structure | `apps/api/app/api/v1/items.py`, `router.py` | New `app/api/v1/links.py` (link CRUD) and a `graph` route registered the same way. |
| Refresh-after-update gotcha | `docs/architecture/milestone-1-foundations.md` addendum, `apps/api/app/api/v1/items.py:update_item` | N/A here (links have no `onupdate` column) but worth checking if any new mutable field needs it. |
| Backend tests | `apps/api/tests/test_items.py`, `test_isolation.py` | Same `login_as`/`client` fixture pattern; extend `test_isolation.py` with a links/graph cross-space case rather than a new suite. |
| Frontend API client | `apps/web/lib/api-client.ts`, `lib/types.ts` | New `Link`/`GraphData` types; calls via the existing `api.get/post/delete`. |
| Frontend page structure | `apps/web/app/spaces/[spaceId]/items/[itemId]/page.tsx` | "Linked items" section follows the same client-component + `useEffect` fetch + form pattern as the rest of the item detail page. |
| Client-only rendering | N/A (new pattern for this milestone) | `react-force-graph-2d` touches `window`/canvas at load time — must be loaded via `next/dynamic(() => import(...), { ssr: false })`, not a plain import, or the build/SSR pass will fail. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/app/models/item_link.py` | CREATE | `ItemLink(Base, SpaceScopedMixin)`: id, space_id, item_a_id, item_b_id, created_by, created_at |
| `apps/api/app/models/__init__.py` | UPDATE | Register `ItemLink` |
| `apps/api/app/db/migrations/versions/0004_create_item_links.py` | CREATE | `item_links` table, `CHECK (item_a_id < item_b_id)` (canonical order + no self-links), `UNIQUE(item_a_id, item_b_id)`, RLS enable/force + 4 policies |
| `apps/api/app/schemas/link.py` | CREATE | `LinkCreate {other_item_id}`, `LinkedItemOut {link_id, item: ItemOut}` |
| `apps/api/app/schemas/graph.py` | CREATE | `GraphNode {id, title, kind}`, `GraphEdge {id, source, target}`, `GraphData {nodes, edges}` |
| `apps/api/app/api/v1/links.py` | CREATE | `POST/GET /spaces/{space_id}/items/{item_id}/links`, `DELETE .../links/{link_id}` |
| `apps/api/app/api/v1/graph.py` | CREATE | `GET /spaces/{space_id}/graph` — full node/edge set for the space |
| `apps/api/app/api/v1/router.py` | UPDATE | Register `links.router`, `graph.router` |
| `apps/api/tests/test_links.py` | CREATE | Create/list/delete, dedup, self-link, cross-space-item rejection |
| `apps/api/tests/test_graph.py` | CREATE | Graph endpoint returns correct nodes/edges |
| `apps/api/tests/test_isolation.py` | UPDATE | Cross-space link/graph case |
| `apps/web/package.json` | UPDATE | Add `react-force-graph-2d` |
| `apps/web/lib/types.ts` | UPDATE | Add `LinkedItem`, `GraphData`, `GraphNode`, `GraphEdge` |
| `apps/web/components/ItemLinkPicker.tsx` | CREATE | Linked-items list + add/unlink picker for the item detail page |
| `apps/web/app/spaces/[spaceId]/items/[itemId]/page.tsx` | UPDATE | Add the "Linked items" section |
| `apps/web/components/GraphView.tsx` | CREATE | Client-only wrapper around `react-force-graph-2d` (node coloring by kind, click-to-navigate, hover label) |
| `apps/web/app/spaces/[spaceId]/graph/page.tsx` | CREATE | Fetches `GET /graph`, renders `GraphView`, kind-filter checkboxes |
| `apps/web/app/spaces/[spaceId]/page.tsx` | UPDATE | Add a "View graph" link |
| `apps/web/tests/ItemLinkPicker.test.tsx` | CREATE | Component test |
| `apps/web/tests/e2e/smoke.spec.ts` | UPDATE | Extend: create two items, link them, open the graph page, see both nodes |
| `docs/architecture/milestone-1-foundations.md` | UPDATE | Short addendum noting the convention held for `item_links` too, plus the `next/dynamic({ ssr:false })` gotcha for canvas-based libraries |
| `.claude/prds/mnemo.prd.md` | UPDATE | Mark Milestone 3 row, Plan cell → this file |

## Tasks

### Task 1: `item_links` model + migration
- **Action**: `ItemLink(Base, SpaceScopedMixin)`: `id UUID PK`, `space_id` (mixin), `item_a_id UUID FK items.id ON DELETE CASCADE`, `item_b_id UUID FK items.id ON DELETE CASCADE`, `created_by UUID FK users.id`, `created_at`. Migration `0004`: create table, `CHECK (item_a_id < item_b_id)` (UUIDs are comparable in Postgres; this single constraint both canonicalizes ordering and rules out self-links), `UNIQUE(item_a_id, item_b_id)` (rules out duplicate links), index `space_id`, `ENABLE`/`FORCE ROW LEVEL SECURITY` + 4 policies matching `0003`'s pattern.
- **Validate**: `alembic upgrade head` clean; `\d+ item_links` shows the CHECK/UNIQUE constraints and RLS flags.

### Task 2: Link endpoints
- **Action**: `app/api/v1/links.py`, mounted under the existing items path (`/spaces/{space_id}/items/{item_id}/links`):
  - `POST` `{other_item_id}` → validate `other_item_id != item_id`; fetch the other item via `scoped_select(Item, space_id)` (404 if it doesn't exist in this space — same "don't confirm existence" posture as everything else); sort `(item_id, other_item_id)` into `(item_a_id, item_b_id)`; if a row already exists, raise a `DomainError` ("already linked"); else insert.
  - `GET` → for the given item, find all `item_links` rows where it's `item_a_id` or `item_b_id`, join to the *other* item, return `LinkedItemOut[]` (link id + the other item's summary).
  - `DELETE /{link_id}` → scoped delete, 404 if not found for this item.
- **Validate**: manual httpx pass: link two items, list from both sides, attempt a duplicate (rejected), attempt a self-link (rejected), unlink.

### Task 3: Graph endpoint
- **Action**: `app/api/v1/graph.py`: `GET /spaces/{space_id}/graph` depends on `get_current_space`, returns `{nodes: [{id, title, kind}], edges: [{id, source, target}]}` — one query for all of the space's items (`scoped_select(Item, ...)`), one for all `item_links` in the space, assembled into the response shape `react-force-graph-2d` expects (`source`/`target` as node ids).
- **Validate**: manual httpx call against a space with a few linked items; confirm node/edge counts match.

### Task 4: Backend tests
- **Action**: `test_links.py` (create, list from both directions, duplicate rejected, self-link rejected, other-space item rejected as 404, delete). `test_graph.py` (empty space → empty graph; a few items + links → correct nodes/edges). Extend `test_isolation.py`: user B can't create/list/delete links on user A's items, and `GET /spaces/{space1}/graph` 404s for a non-member.
- **Validate**: `pytest apps/api/tests -v` green.

### Task 5: Frontend — graph page
- **Action**: `npm install react-force-graph-2d`. `components/GraphView.tsx` loaded via `next/dynamic(() => import("./GraphViewInner"), { ssr: false })` pattern (split into an outer client-safe wrapper and an inner component that actually imports `react-force-graph-2d`, since the library itself isn't SSR-safe) — colors nodes by `kind`, shows a hover label (title + kind), and navigates to `/spaces/{spaceId}/items/{id}` on node click. `app/spaces/[spaceId]/graph/page.tsx` fetches `GET /api/v1/spaces/{spaceId}/graph`, renders `GraphView`, and has checkboxes to filter nodes (and their edges) by kind client-side. Add a "View graph" link on the space page.
- **Validate**: manual browser check — create 3+ linked items, open the graph, confirm nodes render, move/repel visibly, zoom/pan work, clicking a node navigates to it, and the kind filter hides/shows nodes correctly.

### Task 6: Frontend — linked items on the item detail page
- **Action**: `ItemLinkPicker.tsx`: fetches the item's current links (`GET .../links`) and the space's full item list (`GET /spaces/{id}/items`, already available) to build a `<select>` of linkable items (excluding self and already-linked ones); "Link" button posts, unlink buttons delete. Wired into the item detail page below the edit form.
- **Validate**: manual check — link two items from one item's page, confirm the link shows up from the other item's page too.

### Task 7: Frontend tests
- **Action**: `ItemLinkPicker.test.tsx` mirroring the existing mock-`api` pattern (link succeeds and appears in the list; unlink removes it). Extend the Playwright smoke spec: after the existing note-capture flow, create a second item, link it to the first via the picker, visit `/spaces/{id}/graph`, and assert the graph page rendered (e.g. a canvas element is present) without erroring.
- **Validate**: `npm test` and `npm run test:e2e` green.

### Task 8: Docs + PRD
- **Action**: Addendum in `docs/architecture/milestone-1-foundations.md` (or promote it to a more general "conventions" doc if it's getting item-specific — a judgment call at write time, default to appending) noting `item_links` followed the same pattern, plus the `next/dynamic({ ssr: false })` note for future canvas/WebGL-based UI (e.g. milestone 4's embeddings visualizations, if any). Update the PRD row.
- **Validate**: doc updated; PRD row `complete` with this plan's path.

## Validation
```bash
# Backend
cd apps/api && uv run alembic upgrade head && DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" uv run pytest -v

# Frontend
cd apps/web && npm run build && npm test

# E2E (starts both servers)
cd apps/web && npm run test:e2e

# Manual: create 3+ items in a space, link several, open /spaces/{id}/graph,
# confirm physics-based layout, zoom/pan, node click-to-navigate, and kind filtering
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| `react-force-graph-2d` breaks Next.js's SSR/build pass if imported directly in a Server or naively in a Client Component | Medium | Task 5 explicitly uses the `next/dynamic({ ssr: false })` split-component pattern; validate with `npm run build`, not just `npm run dev` |
| UUID `<` comparison for canonical link ordering behaving unexpectedly across Postgres versions/collations | Low | UUID comparison in Postgres is a well-defined byte-wise operation, not collation-dependent (unlike text); confirmed via Task 1's manual `\d+` check and Task 4's duplicate-link test |
| Graph endpoint becoming a performance problem as a space grows | Low (out of scope for MVP scale) | Not addressed in this milestone; flag as a future concern if item counts grow beyond low hundreds per space |

## Acceptance
- [ ] All 8 tasks complete
- [ ] `pytest apps/api/tests` green, including link/graph isolation cases
- [ ] `npm test` and `npm run test:e2e` green
- [ ] `npm run build` succeeds (proves the graph library doesn't break SSR)
- [ ] Manual walkthrough: link items, view the graph (physics motion, zoom/pan, click-to-navigate, kind filter), unlink an item
- [ ] PRD Milestone 3 row updated to `complete` with Plan path set
