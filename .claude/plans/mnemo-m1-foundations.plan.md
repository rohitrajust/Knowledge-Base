# Plan: Mnemo — Milestone 1: Foundational Platform & Project Isolation

**Source PRD**: `.claude/prds/mnemo.prd.md`
**Selected Milestone**: 1 — Foundational platform & project isolation
**Complexity**: Medium

## Context
Mnemo is a brand-new, currently empty project (only the PRD exists — no code, no repo scaffold). The PRD's core hypothesis — that AI-grounded Q&A and semantic search over a team's notes will help engineers understand a project faster than manual searching — can't be tested until there's a place to put notes. But every later milestone (capture, graph, semantic search, grounded Q&A, memory, team collaboration) depends on two things existing correctly from day one: a tenant boundary ("space") that scopes all content, and a way to identify "current user" and "current space" on every request. The PRD explicitly calls out getting this right *now* as a risk ("Mock auth in MVP could mask project-isolation or permission bugs that surface later"), so this milestone's job is narrow and load-bearing: stand up the repo, the isolation boundary, mock auth, and baseline observability — nothing about notes, embeddings, or the graph yet. Getting the `space_id` enforcement pattern right here means milestones 2–8 inherit it instead of retrofitting it.

**Confirmed decisions** (already agreed with the user, not open for re-litigation in this plan):
- Stack: Next.js/React/TypeScript frontend, separate Python FastAPI backend (monorepo)
- Database: PostgreSQL with the `pgvector` extension enabled now (unused until milestone 4, but provisioned so later migrations are additive)
- Deployment: local dev only for this milestone (no Docker Compose yet)
- Isolation enforcement: **defense in depth** — a FastAPI dependency/query-scoping layer *and* Postgres Row-Level Security (RLS) on every tenant-scoped table, so a leak requires two independent mechanisms to fail, not one

## Patterns to Mirror
No existing code exists in this repository — there is nothing to mirror. The conventions below are being established *by* this milestone and should be treated as the pattern for milestones 2–8 to follow (documented in `docs/architecture/milestone-1-foundations.md`, see Tasks).

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/web/**` | CREATE | Next.js frontend app (login, spaces list, space shell) |
| `apps/api/app/main.py`, `config.py` | CREATE | FastAPI app factory + settings |
| `apps/api/app/db/session.py`, `db/base.py` | CREATE | Async SQLAlchemy engine/session, declarative base |
| `apps/api/app/db/migrations/versions/0001_*.py` | CREATE | `users`, `spaces`, `space_memberships`, `sessions` tables |
| `apps/api/app/db/migrations/versions/0002_*.py` | CREATE | Enable `pgvector` extension + RLS policies on tenant tables |
| `apps/api/app/models/*.py` | CREATE | SQLAlchemy models incl. `SpaceScopedMixin` |
| `apps/api/app/schemas/*.py` | CREATE | Pydantic request/response schemas |
| `apps/api/app/auth/mock_auth.py`, `session.py`, `dependencies.py` | CREATE | Mock login, session store, `get_current_user`/`get_current_space` |
| `apps/api/app/core/query_scoping.py` | CREATE | Mandatory-`space_id` repository helper (app-layer isolation) |
| `apps/api/app/core/logging.py`, `middleware.py`, `errors.py` | CREATE | Structured logging, request-ID middleware, uniform error envelope |
| `apps/api/app/api/v1/auth.py`, `spaces.py`, `health.py` | CREATE | Login/logout/me, space CRUD + membership, health checks |
| `apps/api/app/seed.py` | CREATE | Seeds fixed mock users (alice/bob/carol) |
| `apps/api/tests/test_isolation.py` | CREATE | Regression suite proving no cross-space data leakage (must pass before this milestone is done) |
| `apps/api/tests/test_auth.py`, `test_spaces.py`, `test_health.py`, `conftest.py` | CREATE | Backend test suite |
| `apps/web/tests/**` | CREATE | Component tests + one Playwright smoke flow |
| `docs/architecture/milestone-1-foundations.md` | CREATE | Documents the `space_id` convention and enforcement pattern for future milestones |
| `.claude/prds/mnemo.prd.md` | UPDATE | Mark Milestone 1 row `in-progress`, set Plan cell to this file's path |

## Tasks

### Task 1: Scaffold the monorepo
- **Action**: `create-next-app` (TS, App Router) into `apps/web`; `uv`-managed FastAPI project into `apps/api`; root `.gitignore`, `README.md`.
- **Validate**: `npm run dev` (web) and `uv run uvicorn app.main:app --reload` (api) both start without error.

### Task 2: Provision Postgres locally
- **Action**: Create `mnemo_dev` and `mnemo_test` databases with `pgvector` available; `.env.example` with `DATABASE_URL`.
- **Validate**: `psql mnemo_dev -c "SELECT 1;"` succeeds.

### Task 3: Backend core skeleton
- **Action**: `main.py`, `config.py` (pydantic-settings), async SQLAlchemy session, `core/logging.py` (structlog JSON), `core/middleware.py` (request-ID + access log), `core/errors.py` (uniform error envelope: `{"error": {"code","message","request_id"}}`).
- **Validate**: `GET /health` returns 200 with a JSON access-log line including `request_id`.

### Task 4: Migrations — schema + isolation
- **Action**: `0001` creates `users`, `spaces`, `space_memberships`, `sessions` (columns/keys as below). `0002` runs `CREATE EXTENSION IF NOT EXISTS vector;` and adds RLS policies on tenant-scoped tables keyed on a `SET app.current_space_id` session variable.
- **Schema**:
  - `users(id UUID PK, email TEXT UNIQUE, display_name TEXT, created_at)`
  - `spaces(id UUID PK, name TEXT, slug TEXT UNIQUE, created_by -> users.id, created_at)`
  - `space_memberships(id UUID PK, space_id -> spaces.id ON DELETE CASCADE, user_id -> users.id ON DELETE CASCADE, role TEXT DEFAULT 'member', created_at, UNIQUE(space_id, user_id))`
  - `sessions(id UUID PK, user_id -> users.id ON DELETE CASCADE, created_at, expires_at)`
- **Convention for milestones 2–8**: every future content table gets `space_id UUID NOT NULL REFERENCES spaces(id)`, indexed, RLS-enabled, and goes through `query_scoping.py`.
- **Validate**: `alembic upgrade head` runs clean on a fresh DB; `\d+ spaces` in psql shows RLS enabled.

### Task 5: Models, schemas, query-scoping helper
- **Action**: SQLAlchemy models with `SpaceScopedMixin`; Pydantic schemas; `core/query_scoping.py` implementing a repository pattern that requires `current_space_id` before any query executes (app-layer isolation, paired with RLS from Task 4).
- **Validate**: unit test instantiating the helper without a `space_id` raises a type/validation error at call time.

### Task 6: Mock auth
- **Action**: `auth/mock_auth.py` (seeded users, no passwords), `auth/session.py` (opaque server-side session token, HttpOnly/SameSite cookie), `auth/dependencies.py` (`get_current_user`, `get_current_space` — the latter is the **single choke point**: looks up `space_memberships(space_id, user.id)`, 404s if absent so non-members can't even confirm a space exists). `seed.py` seeds alice/bob/carol.
- **Endpoints**: `POST /api/v1/auth/login {email}`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- **Validate**: login with seeded email sets cookie; login with unknown email 401s; `/auth/me` without cookie 401s.

### Task 7: Space management endpoints
- **Action**: `api/v1/spaces.py` — `POST /spaces` (create, creator becomes `owner`), `GET /spaces` (only caller's spaces), `GET /spaces/{id}` (via `get_current_space`), `GET /spaces/{id}/members`, `POST /spaces/{id}/members` (owner-only invite by seeded email), `DELETE /spaces/{id}/members/{user_id}` (owner-only, blocks removing sole owner). All space-scoped routes depend on `get_current_space`; `space_id` is never trusted from a request body.
- **Validate**: manual curl/httpx pass through the flow: create → list → invite → list members → remove.

### Task 8: Backend tests, including the isolation regression suite
- **Action**: `conftest.py` (transactional DB fixture + `httpx.AsyncClient`); `test_health.py`, `test_auth.py`, `test_spaces.py`; then `test_isolation.py`:
  - user A / space1, user B / space2, no shared membership
  - `GET /spaces` as A excludes space2
  - `GET /spaces/{space2.id}` as A → 404
  - `GET/POST /spaces/{space2.id}/members` as A → 404
  - after B adds A to space2, A can access it (proves membership-based, not blanket denial)
  - a raw-SQL test setting `app.current_space_id=space1` and asserting a direct query against a tenant table never returns space2 rows (proves RLS holds independent of the ORM layer)
- **Validate**: `pytest apps/api/tests -v` — all green, `test_isolation.py` must pass before this milestone is considered done.

### Task 9: Frontend — session handling, pages, tests
- **Action**: `lib/api-client.ts` (typed fetch wrapper, surfaces the error envelope), `lib/session.ts`, `middleware.ts` (redirect unauthenticated → `/login`); pages: `/login` (pick seeded user), `/spaces` (list + create form), `/spaces/[spaceId]` (shell + `SpaceSwitcher` + members panel + invite form). Component tests (Vitest + RTL) for the forms/switcher; one Playwright smoke test covering login → create space → switch spaces → invite member.
- **Validate**: `npm test` and `npx playwright test` pass; manual click-through in the browser confirms the flow.

### Task 10: Document the convention
- **Action**: `docs/architecture/milestone-1-foundations.md` — the `space_id` convention, the `get_current_space`/query-scoping/RLS enforcement pattern, and the mock-auth swap-out path (only `auth/mock_auth.py` changes when real auth arrives).
- **Validate**: doc exists and is referenced from `README.md`.

### Task 11: Mark milestone in-progress
- **Action**: Update `.claude/prds/mnemo.prd.md` Milestone 1 row: status → `in-progress`, Plan cell → this plan's path.

## Validation
```bash
# Backend
cd apps/api && uv run alembic upgrade head && uv run pytest -v

# Frontend
cd apps/web && npm run build && npm test && npx playwright test

# Manual end-to-end
# 1. uv run uvicorn app.main:app --reload   (apps/api)
# 2. npm run dev                             (apps/web)
# 3. Log in as alice -> create space "Demo" -> invite bob -> log in as bob -> confirm bob sees "Demo" but not a space alice didn't invite him to
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| RLS session variable (`app.current_space_id`) not set on a connection, silently falling back to permissive behavior | Medium | Default RLS policies to deny-by-default (no rows visible unless the variable is explicitly set); cover with the raw-SQL isolation test in Task 8 |
| Mock auth's simplicity leads someone to skip the `get_current_space` dependency and query a table directly in a future milestone | Medium | RLS (Task 4) is exactly the backstop for this; document the pattern (Task 10) so it's the obvious default to copy |
| pgvector extension unavailable in the local Postgres install | Low | Verify in Task 2 before writing migrations; most Postgres 15+ distributions/Homebrew formulas include it |
| Scope creep into real auth/RBAC during this milestone | Low | PRD explicitly scopes mock auth as acceptable for MVP; role model stays `owner`/`member` only |

## Acceptance
- [ ] All 11 tasks complete
- [ ] `pytest apps/api/tests` green, including `test_isolation.py`
- [ ] `npm test` and Playwright smoke test green
- [ ] Manual end-to-end walkthrough (two users, two spaces) confirms no cross-space visibility
- [ ] `docs/architecture/milestone-1-foundations.md` written
- [ ] PRD Milestone 1 row updated to `in-progress` with Plan path set
