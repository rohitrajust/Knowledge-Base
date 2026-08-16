# Plan: Mnemo — Milestone 2: Capture & Organize

**Source PRD**: `.claude/prds/mnemo.prd.md`
**Selected Milestone**: 2 — Capture & organize
**Complexity**: Medium

## Context
Milestone 1 built the isolation boundary (spaces, membership, mock auth, RLS) but a space has nothing in it yet. Milestone 2 is the first slice of the actual product loop the PRD describes (capture → organize → connect → understand → retrieve → ask → remember): team members need to create, edit, and organize notes, documents, and references inside a space. Everything from here on — the graph (milestone 3), embeddings/search (milestone 4), and grounded Q&A (milestone 5) — operates over whatever this milestone lets people put into a space, so the content model chosen now determines how uniformly later milestones can index and link it.

**Confirmed decisions** (already agreed with the user, not open for re-litigation in this plan):
- Content model: a single space-scoped `items` table with a `kind` discriminator (`note` | `document` | `reference`), not three separate tables — keeps milestone 3 (graph nodes) and milestone 4 (embeddings) working over one uniform table instead of a union of three.
- Documents are text-based for this milestone (typed/pasted long-form content, same storage as notes) — real file upload/storage is explicitly deferred to a later milestone.
- Organization is a flat, per-space list for now — no folders or tags. Structure comes from milestone 3's manual graph, not a parallel taxonomy.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Space-scoped model | `apps/api/app/models/space_membership.py` + `apps/api/app/models/mixins.py:SpaceScopedMixin` | New content tables inherit `SpaceScopedMixin` for the `space_id` FK/index; id/timestamps follow the same `UUID` PK + `server_default=func.now()` style as `Space`/`SpaceMembership`. |
| Isolation enforcement | `apps/api/app/auth/dependencies.py:get_current_space` | Every item route depends on `get_current_space` (404s for non-members, activates the RLS session var) exactly like `apps/api/app/api/v1/spaces.py` — no new isolation surface to invent. |
| RLS policy + `NULLIF` guard | `apps/api/app/db/migrations/versions/0002_enable_pgvector_and_rls.py` | New `items` table gets `ENABLE`/`FORCE ROW LEVEL SECURITY` and a policy on `NULLIF(current_setting('app.current_space_id', true), '')::uuid`, matching the documented gotcha in `docs/architecture/milestone-1-foundations.md`. |
| Query scoping | `apps/api/app/core/query_scoping.py:scoped_select` | List/detail queries use `scoped_select(Item, current.space.id)` rather than an ad hoc `select(Item).where(...)`. |
| Router structure | `apps/api/app/api/v1/spaces.py`, `router.py` | New `app/api/v1/items.py` registered into `api_router` the same way `spaces.router` is. |
| Errors | `apps/api/app/core/errors.py` | Reuse `NotFoundError`/`ForbiddenError` for missing items / non-member access. |
| Backend tests | `apps/api/tests/test_spaces.py`, `test_isolation.py` | Same `login_as` + `client` fixture pattern; extend `test_isolation.py` with an items-specific cross-space case rather than a separate isolation suite. |
| Frontend API client | `apps/web/lib/api-client.ts`, `lib/types.ts` | New `Item` type + calls via the existing `api.get/post/delete` wrapper (add `api.patch` alongside them). |
| Frontend page structure | `apps/web/app/spaces/[spaceId]/page.tsx`, `components/MemberInviteForm.tsx` | New item list/create/detail follow the same client-component + `useEffect` fetch + form pattern already used for members. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/app/models/item.py` | CREATE | `Item(Base, SpaceScopedMixin)`: id, space_id, kind, title, body, url, created_by, created_at, updated_at |
| `apps/api/app/models/__init__.py` | UPDATE | Register `Item` so Alembic's `target_metadata` sees it |
| `apps/api/app/db/migrations/versions/0003_create_items.py` | CREATE | `items` table + RLS enable/force + `NULLIF`-guarded policy, following 0002's pattern |
| `apps/api/app/schemas/item.py` | CREATE | `ItemCreate`, `ItemUpdate`, `ItemOut` |
| `apps/api/app/api/v1/items.py` | CREATE | CRUD endpoints under `/spaces/{space_id}/items` |
| `apps/api/app/api/v1/router.py` | UPDATE | Register `items.router` |
| `apps/api/tests/test_items.py` | CREATE | CRUD + validation tests |
| `apps/api/tests/test_isolation.py` | UPDATE | Add a cross-space items case (space A can't read/edit/delete space B's item even by guessed ID) |
| `apps/web/lib/types.ts` | UPDATE | Add `Item` interface |
| `apps/web/lib/api-client.ts` | UPDATE | Add `api.patch` |
| `apps/web/components/ItemCreateForm.tsx` | CREATE | Create a note/document/reference |
| `apps/web/components/ItemList.tsx` | CREATE | Flat list of a space's items |
| `apps/web/app/spaces/[spaceId]/items/[itemId]/page.tsx` | CREATE | Item detail + inline edit + delete |
| `apps/web/app/spaces/[spaceId]/page.tsx` | UPDATE | Add a "Knowledge" section (list + create) alongside the existing members panel |
| `apps/web/tests/ItemCreateForm.test.tsx` | CREATE | Component test mirroring `SpaceCreateForm.test.tsx` |
| `apps/web/tests/e2e/smoke.spec.ts` | UPDATE | Extend the existing e2e flow to create a note and confirm it appears |
| `docs/architecture/milestone-1-foundations.md` → rename reference | UPDATE (docs) | Note in the doc (or a new short addendum) that `items` is the first table following the established `SpaceScopedMixin`/RLS convention, confirming it held up unchanged |
| `.claude/prds/mnemo.prd.md` | UPDATE | Mark Milestone 2 row `in-progress`, then `complete` when done, Plan cell → this file |

## Tasks

### Task 1: `items` model + migration
- **Action**: `Item(Base, SpaceScopedMixin)` with `id UUID PK`, `space_id` (from mixin), `kind TEXT NOT NULL` with a `CHECK (kind IN ('note','document','reference'))` constraint (plain String + CHECK, matching `SpaceMembership.role`'s convention rather than a Postgres ENUM type), `title TEXT NOT NULL`, `body TEXT NOT NULL DEFAULT ''`, `url TEXT NULL`, `created_by UUID REFERENCES users(id)`, `created_at`, `updated_at TIMESTAMPTZ DEFAULT now() ON UPDATE` (via `onupdate=func.now()` at the SQLAlchemy level). Migration `0003` creates the table, indexes `space_id`, enables + forces RLS, and adds a `items_space_select`/`insert`/`update`/`delete` policy set keyed on `NULLIF(current_setting('app.current_space_id', true), '')::uuid` (all four commands need policies since RLS denies-by-default per command).
- **Validate**: `alembic upgrade head` clean on both `mnemo_dev`/`mnemo_test`; `\d+ items` in psql shows RLS enabled+forced.

### Task 2: Schemas + endpoints
- **Action**: `ItemCreate {kind, title, body="", url=None}` (validate `url` is required when `kind == "reference"`), `ItemUpdate {title?, body?, url?}` (kind is immutable after creation — keeps the model simple), `ItemOut` mirrors the model. `app/api/v1/items.py`:
  - `POST /spaces/{space_id}/items` → create, `created_by = current_user.id`
  - `GET /spaces/{space_id}/items` → `scoped_select(Item, current.space.id)`, ordered by `updated_at desc`
  - `GET /spaces/{space_id}/items/{item_id}` → 404 if not found *within this space* (scoped query, not a bare PK lookup)
  - `PATCH /spaces/{space_id}/items/{item_id}` → partial update, any space member may edit (not owner-only — matches "team members... create, edit, and organize" in the PRD)
  - `DELETE /spaces/{space_id}/items/{item_id}` → any space member may delete
  All five depend on `get_current_space`, consistent with `spaces.py`.
- **Validate**: manual httpx/curl pass through create → list → get → patch → delete.

### Task 3: Backend tests
- **Action**: `test_items.py` covering create (all three kinds), list ordering, get 404 for a nonexistent/foreign item, patch, delete, and the `reference` `url`-required validation. Extend `test_isolation.py`: user A creates an item in space1; user B (space2, not a member of space1) gets 404 on `GET/PATCH/DELETE /spaces/{space1}/items/{item_id}`, proving the existing `get_current_space` + RLS combination extends to content tables without new code.
- **Validate**: `pytest apps/api/tests -v` green.

### Task 4: Frontend — types, list, create, detail/edit
- **Action**: `Item` type in `lib/types.ts`; `api.patch` added to `api-client.ts`. `ItemCreateForm` (kind select + title + body + conditional url field) and `ItemList` (flat list, links to detail) added to the existing space page below the members panel. `app/spaces/[spaceId]/items/[itemId]/page.tsx` shows the item with an inline edit form (reuse the same field set as create) and a delete button that navigates back to the space page.
- **Validate**: `npm run build` clean; manual browser walkthrough (create a note, a reference with URL, a document; edit one; delete one).

### Task 5: Frontend tests
- **Action**: `ItemCreateForm.test.tsx` mirroring `SpaceCreateForm.test.tsx`'s mock-`api`-and-assert-callback pattern, including the reference-requires-url case. Extend the Playwright smoke spec: after creating a space, create a note and assert it appears in the list.
- **Validate**: `npm test` and `npm run test:e2e` both green.

### Task 6: Docs + PRD
- **Action**: Confirm/record in `docs/architecture/milestone-1-foundations.md` (or a short new note) that the `SpaceScopedMixin` + RLS + `get_current_space` convention held for the first real content table unchanged. Update the PRD milestone row.
- **Validate**: doc updated; PRD row shows `complete` with this plan's path once Task 1-5 are verified.

## Validation
```bash
# Backend
cd apps/api && uv run alembic upgrade head && DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" uv run pytest -v

# Frontend
cd apps/web && npm run build && npm test

# E2E (starts both servers)
cd apps/web && npm run test:e2e

# Manual: log in, open a space, create a note/document/reference, edit one, delete one
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Forgetting a per-command RLS policy on `items` (SELECT/INSERT/UPDATE/DELETE each need one, unlike `spaces` which only needed SELECT+INSERT) | Medium | Explicit checklist in Task 1; the isolation test's PATCH/DELETE cases in Task 3 will fail loudly if a policy is missing |
| `kind`-specific validation (e.g. reference needing a URL) creeping into a full type-specific schema system | Low | Keep validation to the one `url`-required-for-reference rule; resist adding per-kind fields beyond what's already agreed |
| Editing being owner-only by accident (copying `require_space_owner` from the invite/remove-member endpoints) | Low | Task 2 explicitly notes edit/delete are member-level, not owner-level, since the PRD scopes this as shared team editing |

## Acceptance
- [ ] All 6 tasks complete
- [ ] `pytest apps/api/tests` green, including the new items isolation case
- [ ] `npm test` and `npm run test:e2e` green
- [ ] Manual walkthrough: create note/document/reference, edit, delete, confirm space isolation still holds
- [ ] PRD Milestone 2 row updated to `complete` with Plan path set
