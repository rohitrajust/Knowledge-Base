# Mnemo

AI-native knowledge base for software engineering teams: shared spaces, semantic
search, grounded Q&A, and an interactive knowledge graph.

This single document covers everything: what Mnemo is, how to set it up on
Windows or macOS, how to run and test it day to day, and the architecture and
conventions behind the backend and frontend.

## Table of contents

- [Overview](#overview)
- [Setup](#setup)
  - [Prerequisites](#prerequisites)
  - [Install PostgreSQL 18](#install-postgresql-18)
  - [Create the database and role](#create-the-database-and-role)
  - [Backend setup](#backend-setup)
  - [Frontend setup](#frontend-setup)
  - [Verify it works](#verify-it-works)
  - [Troubleshooting](#troubleshooting)
- [Day to day development](#day-to-day-development)
  - [Environment variables](#environment-variables)
  - [Admin scripts](#admin-scripts)
  - [Backend testing](#backend-testing)
  - [Frontend testing](#frontend-testing)
- [Backend architecture](#backend-architecture)
  - [Module layout](#module-layout)
  - [Isolation and auth conventions](#isolation-and-auth-conventions)
  - [API reference](#api-reference)
- [Frontend architecture](#frontend-architecture)
  - [Routing](#routing)
  - [Auth flow](#auth-flow)
  - [Data fetching](#data-fetching)
  - [Component layout](#component-layout)
  - [Known simplifications](#known-simplifications)
  - [Design system](#design-system)

## Overview

AI-native knowledge base for software engineering teams: shared spaces, semantic
search, grounded Q&A, and an interactive knowledge graph. The backend is a
FastAPI service (`apps/api`) handling space-scoped notes/documents/references, a
manual knowledge graph, semantic search, and grounded Q&A with persistent
memory. The frontend is a Next.js (App Router) app (`apps/web`).

## Setup

This is the canonical, start-to-finish guide for getting Mnemo running
locally. It covers Windows and macOS side by side; wherever a command differs,
both versions are shown. It uses plain `pip`/`venv` for the backend -- no extra
tooling to install first.

If you get stuck, check [Troubleshooting](#troubleshooting) before asking for
help.

### Prerequisites

You need four things installed: Git, Python 3.12, Node.js, and PostgreSQL 18.

#### Windows

- **Git**: [git-scm.com/download/win](https://git-scm.com/download/win)
- **Python 3.12**: [python.org/downloads](https://www.python.org/downloads/) --
  on the first installer screen, check **"Add python.exe to PATH"** before
  clicking Install.
- **Node.js (LTS)**: [nodejs.org](https://nodejs.org/)
- **PostgreSQL 18**: see [Install PostgreSQL 18](#install-postgresql-18) below.

Verify everything is on `PATH` by opening a **new** terminal (PowerShell) and
running:

```powershell
git --version
python --version
node --version
psql --version
```

#### macOS

The easiest path is [Homebrew](https://brew.sh/). With Homebrew installed:

```bash
brew install git python@3.12 node
```

PostgreSQL 18 is covered in the next section. Verify:

```bash
git --version
python3 --version
node --version
```

### Install PostgreSQL 18

Mnemo needs plain, stock PostgreSQL -- no extensions.

#### Windows

1. Download the PostgreSQL 18 installer from
   [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
   (or run `winget install PostgreSQL.PostgreSQL.18` in PowerShell).
2. During install, you'll be asked to set a password for the `postgres`
   superuser -- pick something and remember it, you'll need it in the next
   step. Keep the default port (`5432`).
3. Open a **new** PowerShell window and run `psql --version`. If it's not
   found, add `C:\Program Files\PostgreSQL\18\bin` to your `PATH`
   (Settings -> "Edit the system environment variables" -> Environment
   Variables -> edit `Path` -> add that folder -> restart the terminal).

**Important Windows-specific gotcha:** the Windows installer configures
password-based authentication (`scram-sha-256`) for local connections, unlike
some Linux/Mac setups that trust local connections with no password. That
means the app's database role **must** have a password set -- the next step
creates it with one for exactly this reason. If you skip that and create a
passwordless role, the backend will fail to connect with
`password authentication failed for user "mnemo_app"`.

#### macOS

```bash
brew install postgresql@18
brew services start postgresql@18
```

If `psql`/`createdb` aren't found afterwards, add Postgres to your `PATH`
(Homebrew prints the exact line to add to your shell profile after install;
on Apple Silicon it's typically
`export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"`).

### Create the database and role

Mnemo uses Postgres Row-Level Security (RLS) to isolate data between spaces.
RLS is silently bypassed by superuser connections, so the app must connect as
a dedicated, non-superuser role (`mnemo_app`) -- never as `postgres`. See
[Isolation and auth conventions](#isolation-and-auth-conventions) below for
why.

Run the following. On Windows this is PowerShell; on macOS it's Terminal
(bash/zsh) -- the commands themselves (`createdb`, `psql`) are identical on
both once Postgres is on your `PATH`.

**Windows** (you'll be prompted for the `postgres` password you set during
install):

```powershell
createdb -U postgres mnemo_dev
createdb -U postgres mnemo_test
psql -U postgres -d postgres -c "CREATE ROLE mnemo_app WITH LOGIN PASSWORD 'devpassword' NOSUPERUSER NOBYPASSRLS;"

psql -U postgres -d mnemo_dev -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mnemo_app;"
psql -U postgres -d mnemo_dev -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mnemo_app;"
psql -U postgres -d mnemo_dev -c "GRANT USAGE ON SCHEMA public TO mnemo_app;"

psql -U postgres -d mnemo_test -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mnemo_app;"
psql -U postgres -d mnemo_test -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mnemo_app;"
psql -U postgres -d mnemo_test -c "GRANT USAGE ON SCHEMA public TO mnemo_app;"
```

**macOS** (Homebrew Postgres runs under your own user, so `-U postgres` isn't
needed and there's no password prompt):

```bash
createdb mnemo_dev
createdb mnemo_test
psql -d postgres -c "CREATE ROLE mnemo_app WITH LOGIN PASSWORD 'devpassword' NOSUPERUSER NOBYPASSRLS;"

psql -d mnemo_dev -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mnemo_app;"
psql -d mnemo_dev -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mnemo_app;"
psql -d mnemo_dev -c "GRANT USAGE ON SCHEMA public TO mnemo_app;"

psql -d mnemo_test -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mnemo_app;"
psql -d mnemo_test -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mnemo_app;"
psql -d mnemo_test -c "GRANT USAGE ON SCHEMA public TO mnemo_app;"
```

Feel free to replace `'devpassword'` with any password you like -- just make
sure it matches what you put in `.env` in the next step.

### Backend setup

From the repo root:

**Windows (PowerShell):**

```powershell
cd apps\api
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**macOS:**

```bash
cd apps/api
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Now edit `apps/api/.env` and set `DATABASE_URL` to include the role and
password from the previous step:

```
DATABASE_URL=postgresql+asyncpg://mnemo_app:devpassword@localhost/mnemo_dev
```

Then run migrations, seed the mock accounts, and start the server (same
commands on both OSes, from inside the activated virtual environment):

```
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

The API is now running at `http://localhost:8000` (interactive docs at
`/docs`).

**Notes:**

- The first `pip install` pulls in `sentence-transformers` (and `torch`) for
  local embeddings, which is a larger, slower install than the rest of the
  stack. The first server start also downloads the `all-MiniLM-L6-v2` model
  (~90MB) to your local Hugging Face cache -- both are one-time costs.
  `app/main.py`'s `lifespan` warms the model at startup (not on first
  request) so a fresh `uvicorn` start pays this cost before reporting
  healthy, not on the first real request.
- If you're on a corporate network with a TLS-intercepting proxy and that
  model download fails with an SSL error, set `HF_SSL_VERIFY=false` in
  `.env` (see the comment above it in `.env.example`).
- Grounded Q&A (`/ask` and conversations) needs an OpenRouter API key: set
  `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `.env` -- get a key at
  <https://openrouter.ai/keys> and pick a current model slug from
  <https://openrouter.ai/models>. Every other feature works without it.

### Frontend setup

From the repo root, in a **second** terminal (leave the backend running in
the first one):

**Windows (PowerShell):**

```powershell
cd apps\web
copy .env.local.example .env.local
npm install
npm run dev
```

**macOS:**

```bash
cd apps/web
cp .env.local.example .env.local
npm install
npm run dev
```

The app is now running at `http://localhost:3000`.

### Verify it works

1. Open `http://localhost:3000` in a browser.
2. On the login page, pick any of the seeded mock accounts --
   `alice@mnemo.dev`, `bob@mnemo.dev`, or `carol@mnemo.dev` -- no password
   needed, per the MVP's mock-auth scope.
3. You should land on the spaces list. Create a space and an item to confirm
   the backend and database are wired up correctly.

### Troubleshooting

| Problem | Fix |
|---|---|
| `psql`/`createdb`/`python`/`node` not recognized | The relevant install didn't add itself to `PATH`. Open a **new** terminal after installing, or add the install's `bin` folder to `PATH` manually (see Prerequisites/Install PostgreSQL 18 above). |
| `password authentication failed for user "mnemo_app"` | Your `DATABASE_URL` in `.env` doesn't match the password you set on the role earlier. Either update `.env` or re-run `ALTER ROLE mnemo_app WITH PASSWORD 'devpassword';`. |
| `role "mnemo_app" does not exist` | The database/role creation step wasn't run against the right server/database, or was skipped. Re-run the `CREATE ROLE` command. |
| Port `5432` already in use | Another Postgres instance (or install) is already running on that port. Stop it, or point `DATABASE_URL` at the port your intended instance uses. |
| Port `8000` or `3000` already in use | Something else is using that port. Stop it, or run `uvicorn app.main:app --reload --port 8001` / `npm run dev -- -p 3001` and update `NEXT_PUBLIC_API_URL` accordingly. |
| `pip install -r requirements.txt` fails building `torch` or similar | Make sure you're on 64-bit Python 3.12 and have upgraded pip first: `python -m pip install --upgrade pip`. |
| Hugging Face model download fails with an SSL error | You're likely behind a corporate TLS-intercepting proxy. Set `HF_SSL_VERIFY=false` in `apps/api/.env` (see `.env.example` for the full explanation). |
| `/ask` or conversations return "not configured" | Expected until you set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `apps/api/.env` -- every other feature works without it. |

For anything else, see [Backend architecture](#backend-architecture) and
[Frontend architecture](#frontend-architecture) below.

## Day to day development

### Environment variables

| Variable | Default | Notes |
|---|---|---|
| `env` | `development` | |
| `log_level` | `INFO` | |
| `database_url` | `postgresql+asyncpg://localhost/mnemo_dev` | Must connect as the non-superuser `mnemo_app` role for RLS to apply |
| `session_cookie_name` | `mnemo_session` | |
| `session_ttl_seconds` | `604800` (7 days) | |
| `cors_allow_origins` | `["http://localhost:3000"]` | |
| `embedding_model_name` | `all-MiniLM-L6-v2` | Changing this requires a migration updating `items.embedding`'s vector dimension |
| `embedding_dim` | `384` | |
| `hf_ssl_verify` | `true` | Set to `false` only on a trusted network behind a TLS-intercepting corporate proxy whose root CA isn't trusted by Python, to work around SSL errors downloading the embedding model. Disables certificate verification for Hugging Face downloads -- do not set outside that scenario |
| `openrouter_api_key` | `""` | Required for `/ask` and conversation Q&A. Get one at https://openrouter.ai/keys |
| `openrouter_model` | `""` | No default is shipped -- OpenRouter's model catalog changes over time, so pick a current slug from https://openrouter.ai/models. Without this set, `/ask`/conversations return a clear "not configured" error; every other feature works without it |
| `openrouter_fallback_models` | `[]` | Optional fallback slugs if the primary model is rate-limited or down |
| `memory_ttl_days` | `30` | How long an end-of-conversation memory summary stays surfaced before automatic expiry |

See `apps/api/app/config.py` for the full `Settings` model.

### Admin scripts

These run with a database-owner connection (like Alembic migrations), not the
app's restricted `mnemo_app` role, because they need to see across every space
-- RLS correctly blocks the app role from doing that:

```bash
# Backfill embeddings for items created before embeddings existed, or after
# changing the embedding model
DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" python -m app.backfill_embeddings

# Physically delete memory summaries past their TTL (they're already filtered out
# of reads once expired -- this just reclaims storage)
DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" python -m app.cleanup_expired_memories
```

### Backend testing

In the activated venv:

```bash
DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" pytest
```

`tests/test_isolation.py` is the standing cross-space regression suite
(app-layer checks, a raw-SQL check that RLS holds independent of the ORM, and
a check that an unset RLS context denies by default) -- extend it, don't
replace it, when adding a new space-scoped table. Every test mocks external
calls (`generate_completion` for OpenRouter); nothing in the suite makes a
real network call.

### Frontend testing

```bash
npm test          # Vitest + React Testing Library
npm run test:e2e  # Playwright -- starts both the web and API servers automatically
npm run lint
```

Vitest and React Testing Library query by role/label/text (e.g.
`getByRole("button", { name: "Add" })`), not by CSS class -- this is why every
`components/ui/` primitive renders a real underlying semantic element
(`Button` a real `<button>`, `Select` a real `<select>`) rather than a
`div`-based custom control, and why components should keep real semantic
elements under any styling wrapper. Playwright drives both the web and API
servers together and covers full user flows across pages;
`tests/e2e/smoke.spec.ts` is the standing smoke suite.

## Backend architecture

FastAPI backend for Mnemo: space-scoped notes/documents/references, a manual
knowledge graph, semantic search, and grounded Q&A with persistent memory.

### Module layout

| Path | Contents |
|---|---|
| `app/api/v1/` | Route modules, one per resource (see [API reference](#api-reference) below) |
| `app/auth/` | Mock auth (`mock_auth.py` -- the only file to change when swapping in a real identity provider), session store, `dependencies.py` (the `get_current_user`/`get_current_space` choke points) |
| `app/core/` | Cross-cutting logic: RLS activation (`query_scoping.py`), embeddings, retrieval, LLM gateway (`llm.py`), prompting, error types, logging, request-ID middleware |
| `app/models/` | SQLAlchemy models; space-scoped tables inherit `mixins.SpaceScopedMixin` |
| `app/schemas/` | Pydantic request/response models |
| `app/db/migrations/` | Alembic migrations (the source of truth for schema + RLS policies) |
| `app/seed.py` | Seeds the three mock accounts used for local login |

For the conventions behind this structure (space isolation, RLS gotchas,
embedding lifecycle, LLM gateway design, memory bounding), see
[Isolation and auth conventions](#isolation-and-auth-conventions) below, and
[API reference](#api-reference) below for the full endpoint reference.

### Isolation and auth conventions

This section captures the conventions established in Milestone 1
(Foundational platform & project isolation) that every later milestone
(capture, graph, semantic search, grounded Q&A, memory, team collaboration)
builds on rather than reinventing.

#### The `space_id` convention

Every tenant-scoped table -- starting with `space_memberships`, and every
content table added later (`notes`, `documents`, `references`,
`note_embeddings`, `graph_edges`, `conversations`, `messages`,
`memory_entries`, ...) -- gets:

- `space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE`, indexed
- A SQLAlchemy model inheriting `app.models.mixins.SpaceScopedMixin`
- Row-Level Security enabled and forced (see below)
- All reads/writes going through `app.core.query_scoping`, never an ad hoc query

`spaces` itself is the boundary table, not "content" -- it doesn't have a
`space_id` column and is scoped differently (see below).

#### Isolation is enforced by two independent layers

1. **App layer**: `app.auth.dependencies.get_current_space` is the single
   choke point. It resolves `space_id` from the URL path, verifies a
   `space_memberships` row exists for `(space_id, current_user)`, and 404s
   (not 403) if not -- this avoids confirming a space's existence to
   non-members. Every space-scoped route depends on it. A client-supplied
   `space_id` in a request body is never trusted.
2. **Database layer (Postgres RLS)**: `space_memberships` and `spaces` have
   Row-Level Security enabled and **forced**
   (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`), so even a future query that
   forgets to go through `query_scoping.py` still can't leak data across
   spaces. See `db/migrations/versions/0002_enable_pgvector_and_rls.py` for
   the policy definitions and extensive inline commentary on two non-obvious
   gotchas:
   - **Connecting role matters.** Postgres superusers and any role with
     `BYPASSRLS` silently ignore RLS regardless of `FORCE`. The app (and
     tests) must connect as a dedicated, non-superuser role (`mnemo_app`
     locally) or RLS is a no-op. Verify with
     `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;`
     -- both should be `false`.
   - **`current_setting(name, true)` returns `''`, not `NULL`, once touched.**
     After the first `set_config('app.foo', ..., true)` in a session, later
     transactions where that LOCAL value resets see `''`, and `''::uuid`
     raises `invalid input syntax` instead of evaluating to NULL. Every
     policy expression casting a session variable must wrap it in
     `NULLIF(current_setting(name, true), '')::uuid`. This matters even for
     policies that "shouldn't" be reached for a given query: Postgres does
     not guarantee left-to-right short-circuit evaluation between OR'd
     permissive RLS policies, so an unrelated, never-activated variable can
     still get evaluated and throw.

Two session variables drive RLS, both set once per request:

- `app.current_user_id` -- set by `activate_rls_for_user`, called from
  `get_current_user` on every authenticated request. Used by `spaces`' own
  SELECT policy (membership via subquery) and by `space_memberships`'
  self-select policy, so "list my spaces" works without pre-activating any
  specific space.
- `app.current_space_id` -- set by `activate_rls_for_space`, called from
  `get_current_space`. Used by policies on `space_memberships` (and, from
  milestone 2 onward, every content table) once a specific space's membership
  has been verified.

**Gotcha for future content-table inserts**: `INSERT ... RETURNING` requires
the new row to satisfy the table's SELECT policy, evaluated *before* any row
that would make it visible necessarily exists yet (e.g. creating a space
before its owner-membership row exists). Where this chicken-and-egg problem
applies, use a Core `insert()` (no implicit `RETURNING`) followed by a plain
`SELECT` once the row that grants visibility exists -- see `create_space` in
`app/api/v1/spaces.py` for the pattern.

#### Mock auth swap-out path

`app/auth/mock_auth.py` is the only file that should change when mock auth is
replaced with a real identity provider. `sessions` (an opaque, server-side,
revocable session store), `get_current_user`, and `get_current_space` are
designed to be identity-provider agnostic and should not need to change.

(For local Postgres role setup, see
[Create the database and role](#create-the-database-and-role) above. For
running the isolation regression suite, see
[Backend testing](#backend-testing) above.)

#### Addendum (Milestone 2): the convention held

`items` (notes/documents/references, milestone 2's first content table)
followed this convention with zero changes needed to `get_current_space`,
`query_scoping.py`, or the mock-auth layer -- only a new model inheriting
`SpaceScopedMixin`, a migration adding `ENABLE`/`FORCE ROW LEVEL SECURITY`
plus the four per-command policies (SELECT/INSERT/UPDATE/DELETE, since
content tables need all four unlike `spaces`), and routes depending on
`get_current_space` like every other space-scoped route.
`apps/api/tests/test_isolation.py` was extended in place (not duplicated)
with an items-specific cross-space case, confirming the pattern generalizes
as intended.

One new gotcha surfaced: `onupdate=func.now()` columns (e.g.
`items.updated_at`) are not always eagerly refreshed after an ORM `UPDATE`
flush -- accessing them during FastAPI's response serialization can raise
`MissingGreenlet` if the attribute was left "expired." Call
`await db.refresh(item)` after `db.flush()` for any update endpoint that
returns a model with a server-side `onupdate` column (see `update_item` in
`apps/api/app/api/v1/items.py`).

#### Addendum (Milestone 3): the convention held again, plus a canvas/SSR gotcha

`item_links` (at the time, undirected and unlabeled links between two items --
they have since gained a `relation` and a `direction`, see
[API reference](#api-reference) below) followed the same convention as
`items`: `SpaceScopedMixin`, `ENABLE`/`FORCE ROW LEVEL SECURITY` with all four
per-command policies, and routes depending on `get_current_space`. The one new
backend technique: canonical pair ordering via a single
`CHECK (item_a_id < item_b_id)` constraint (UUID comparison in Postgres is a
well-defined byte-wise operation), paired with
`UNIQUE(item_a_id, item_b_id)`, rules out both self-links and
duplicate/reverse links without any extra application-level dedup logic -- the
app just sorts the pair before inserting
(`sorted([item_id, other_item_id])` in Python) and lets the DB enforce the
rest.

New frontend gotcha: `react-force-graph-2d` (and canvas/WebGL libraries
generally) touches `window`/canvas APIs at module load time and is not
SSR-safe. Importing it directly -- even inside a `"use client"` component --
breaks `next build`'s server render pass, because Next.js still renders
Client Components on the server for the initial HTML. The fix is a
two-component split: an inner component that does the real
`import "react-force-graph-2d"`, and an outer wrapper that loads the inner one
via `next/dynamic(() => import("./Inner"), { ssr: false })` (see
`apps/web/components/GraphView.tsx` / `GraphViewInner.tsx`). Any future
canvas/WebGL UI (e.g. embedding visualizations) should follow the same split
rather than importing the library directly.

#### Addendum (Milestone 4): embeddings, and a lazy-load-vs-cold-start lesson

`items.embedding` is a nullable plain Postgres `float8[]` column (SQLAlchemy
`ARRAY(Float)`), not pgvector's `Vector` type -- this deliberately avoids
requiring the `pgvector` extension, which needs superuser/admin rights to
install and isn't available in every environment (managed databases,
locked-down corporate machines). Similarity search has no SQL-side ANN index;
`app/core/retrieval.py` fetches a space's embedded candidates and ranks them
by cosine similarity in Python/numpy, which is fine at MVP table sizes. RLS
needed no changes: it's row-level, a new column doesn't touch it.

Embeddings come from a local `sentence-transformers` model
(`all-MiniLM-L6-v2`), loaded lazily via an `lru_cache`d `get_model()` in
`app/core/embeddings.py` so that admin scripts (Alembic,
`app/backfill_embeddings.py`) importing `app.models` don't pay the model-load
cost. `SentenceTransformer.encode()` is synchronous and CPU-bound; every call
site goes through `embed_text()`, which runs it via `asyncio.to_thread` so it
never blocks the FastAPI event loop.

**Lazy-load caveat**: lazy loading is right for one-off scripts, but a *live
server* should warm the model at startup, not on the first request.
`app/main.py`'s `lifespan` now calls `get_model()` before the app reports
ready -- without this, the first request after a fresh `uvicorn` start pays
the multi-second model-load cost inline, which is invisible in casual manual
testing but reliably broke Playwright's e2e test (a fresh server process per
run, with UI-assertion timeouts far shorter than a cold model load). Any
future startup-costly resource (a local LLM, a large index load) should warm
the same way.

**RLS and administrative scripts**: `app/backfill_embeddings.py` needs to see
items across every space, which RLS (correctly) won't allow the app's
`mnemo_app` role to do. Rather than weakening RLS, the script is documented as
an administrative tool run with a database-owner connection, the same way
Alembic migrations already are -- the live app never runs with that elevated
access, only offline, reviewed, cross-tenant maintenance scripts do.

#### Addendum (Milestone 5): grounded Q&A, and testing external calls

`/ask` reuses milestone 4's embedding retrieval (now extracted into
`app/core/retrieval.py:retrieve_items`, shared with `/search`) and adds one
new external dependency: OpenRouter (https://openrouter.ai), used as a
provider-agnostic LLM gateway rather than a direct Anthropic/OpenAI SDK
integration, so the app isn't tied to one vendor and gets automatic fallback
across models if the primary is rate-limited or down. `app/core/llm.py` is
the *only* module that knows OpenRouter specifically -- everything else calls
`generate_completion(messages)`.

**No default model slug is configured.** OpenRouter's catalog of valid model
slugs changes over time, and hardcoding one risks shipping something stale or
wrong. `OPENROUTER_MODEL`/`OPENROUTER_FALLBACK_MODELS` ship empty; `/ask`
fails fast with a clear, actionable error ("set OPENROUTER_API_KEY and
OPENROUTER_MODEL...") rather than a confusing runtime API error, until they're
set from https://openrouter.ai/models.

**Testing an external, paid, non-deterministic API**: every automated test
mocks `generate_completion` directly
(`unittest.mock.patch("app.api.v1.qa.generate_completion", ...)`) rather than
calling OpenRouter for real -- this keeps the suite free, fast, and
deterministic, consistent with every other external dependency in this
project (the embedding model runs locally; there's no other paid call to
reason about). Live end-to-end verification of the real LLM path requires a
real API key and is a manual step, explicitly not covered by the automated
suite.

#### Addendum (Milestone 6): conversations, memory, and a request-timeout lesson

`conversations`, `messages`, and `memory_summaries` follow the established
convention (`SpaceScopedMixin`, RLS enabled+forced with 4 per-command policies
each) with one addition: `messages.space_id` is denormalized directly onto
the table even though it's also reachable via `conversation_id`, purely so
RLS policies stay uniform (a filter on `space_id`, not a join through
`conversations`) across every table -- the same choice already made for
`item_links`. `messages.sources` is a JSONB snapshot
(`[{"item_id", "title", "kind", "score"}, ...]`) taken at answer time, not a
live FK, so conversation history renders correctly even if a cited item is
later deleted.

**Memory is shared at the space level, not private per user** --
`MemorySummary` is scoped only by `space_id`, so a summary from Alice's
conversation is surfaced in Bob's later conversation in the same space. This
was made an explicit, tested decision (not an implicit side effect of the
schema) after review feedback on the milestone's plan.

**Bounding, not just noting.** Two things that could otherwise grow
unboundedly were given concrete bounds rather than left as "future work"
risks: conversation history fed into any LLM call is capped to the most
recent `MAX_HISTORY_MESSAGES` (20, in `app/core/prompting.py`), and the
end-of-conversation summarization prompt (`SUMMARY_SYSTEM_PROMPT`) explicitly
forbids inventing facts not in the transcript and must respond with the
literal sentinel `NONE` when nothing is durable enough to remember -- ending
a conversation does not guarantee a memory gets created.

**Live-testing discovery: LLM calls need an explicit timeout.** While testing
this milestone against a real (free-tier) OpenRouter model, a client that
disconnected mid-request left the server-side request running indefinitely,
holding its DB transaction (and a row lock) open for as long as the upstream
call took -- observed in practice as several minutes of `idle in transaction`
with the `conversations` row locked, blocking other requests to the same row.
`app/core/llm.py`'s `AsyncOpenAI` client now has an explicit `timeout=60.0`,
so a hung or very slow upstream call fails fast as an `UpstreamError` instead
of holding resources open indefinitely. Any future code path that awaits an
external call before its next flush/commit should have the same kind of
bound.

#### Addendum (Milestone 7): AI-suggested links are stateless, and reuse the real write path

Link suggestions (`GET /spaces/{id}/items/{id}/suggested-links`) are pure
embedding cosine-similarity over `items.embedding`
(`app/core/retrieval.py:suggest_related_items`) -- no LLM call, no new table,
nothing cached or persisted. They're recomputed on every request, the same
way `/search` and `/graph` already are; "dismiss" in the UI is client-side
only and never reaches the backend.

"Approve" is deliberately **not** a new write path: it calls the exact same
`POST .../items/{id}/links` endpoint milestone 3 built and already tests for
RLS, dedup, and self-link rejection. This milestone's only new surface is
*finding* candidates, not creating or storing links -- keeping "AI suggests,
user approves" honest by construction rather than by convention (there's no
code path where a suggestion becomes a link without going through the same
validation a manually-created link does).

This milestone also reached the point where `get_item_or_404` had three
near-identical private copies (`items.py`, `links.py`, and now
`suggestions.py`) -- extracted into `app/core/item_lookup.py` alongside a new
`get_linked_item_ids` helper (used by both `links.py:list_links` and the
suggestion-exclusion query), following this project's established rule of
thumb: two copies is fine, a third is the extraction signal.

### API reference

Generated from `apps/api/app/api/v1/*.py` and their paired
`app/schemas/*.py` files. This is a reference to the actual route/schema
code, not a spec written ahead of it -- when the two diverge, the code wins;
regenerate this section rather than hand-patch it into agreement.

All routes are mounted under `/api/v1` (`app/api/v1/router.py`) except
`/health` and `/health/db`, which are unauthenticated and unversioned. All
endpoints other than `/auth/*` and `/health*` require a valid session cookie;
every `/spaces/{space_id}/...` endpoint additionally requires the caller to
be a member of that space (see **Auth and isolation** below).

#### Error format

Every error response (via `app.core.errors.DomainError` and its subclasses)
uses one envelope:

```json
{ "error": { "code": "not_found", "message": "Space not found.", "request_id": "..." } }
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `domain_error` | Generic validation/business-rule failure (e.g. duplicate link, self-link) |
| 401 | `unauthorized` | Missing/invalid/expired session |
| 403 | `forbidden` | Authenticated, but not permitted (e.g. non-owner attempting an owner-only action) |
| 404 | `not_found` | Resource doesn't exist, or the caller isn't a member of the space (see below) |
| 502 | `upstream_error` | The OpenRouter LLM gateway failed or is unavailable |
| 500 | `internal_error` | Unhandled exception; raw details are logged server-side only |

#### Auth and isolation

- `GET /api/v1/auth/me` (via `get_current_user`) resolves the session cookie
  (`mnemo_session` by default) to a user. Every other authenticated endpoint
  depends on this.
- Every `/spaces/{space_id}/...` route depends on `get_current_space`, which
  verifies a `space_memberships` row exists for `(space_id, current_user)`
  and **404s, not 403s, if not** -- this deliberately avoids confirming a
  space's existence to non-members. A client-supplied `space_id` in a
  request body is never trusted; it always comes from the URL path.
- Isolation is enforced twice: this app-layer check, and Postgres Row-Level
  Security (forced, so it applies even to a query that bypasses
  `get_current_space` by mistake). See
  [Isolation and auth conventions](#isolation-and-auth-conventions) above for
  the RLS design and its gotchas.
- `require_space_owner` gates owner-only actions (rename/delete space,
  invite/remove members) on top of `get_current_space`, returning 403 for a
  non-owner member.

#### Auth (`/api/v1/auth`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/auth/login` | none | `{ email, password }` | `UserOut`, sets session cookie |
| POST | `/auth/signup` | none | `{ email, display_name, password (min 8 chars) }` | `201` `UserOut`, sets session cookie |
| POST | `/auth/logout` | none | -- | `{ status: "ok" }`, clears session cookie |
| GET | `/auth/me` | session | -- | `{ user: UserOut, spaces: SpaceOut[] }` |

Login and signup return the identical "Invalid email or password." message
regardless of whether the email is unknown or the password is wrong, to avoid
confirming which half of the pair was incorrect.

#### Spaces (`/api/v1/spaces`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/spaces` | session | `{ name }` | `201` `SpaceOut` |
| GET | `/spaces` | session | -- | `SpaceOut[]` (spaces the caller belongs to) |
| GET | `/spaces/{space_id}` | member | -- | `SpaceOut` |
| PATCH | `/spaces/{space_id}` | owner | `{ name }` | `SpaceOut` (slug never changes, even on rename) |
| DELETE | `/spaces/{space_id}` | owner | -- | `204` (cascades to every space-scoped table) |
| GET | `/spaces/{space_id}/members` | member | -- | `MembershipOut[]` |
| POST | `/spaces/{space_id}/members` | owner | `{ email }` | `201` `MembershipOut` -- 404 if no seeded account matches the email |
| DELETE | `/spaces/{space_id}/members/{user_id}` | owner | -- | `204` -- 403 if removing the sole remaining owner |

`SpaceOut`: `{ id, name, slug, created_by, created_at }`.

#### Items (`/api/v1/spaces/{space_id}/items`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/items` | member | `ItemCreate` | `201` `ItemOut` |
| GET | `/items` | member | -- | `ItemOut[]`, newest-updated first |
| GET | `/items/{item_id}` | member | -- | `ItemOut` |
| PATCH | `/items/{item_id}` | member | `ItemUpdate` (partial) | `ItemOut` |
| DELETE | `/items/{item_id}` | member | -- | `204` |

`ItemCreate`: `{ kind: "note"|"document"|"reference", title (1-300 chars), body?, url? }`
-- `url` is required when `kind` is `"reference"`. `ItemOut` adds
`{ id, space_id, created_by, created_at, updated_at }`. Creating or updating
`title`/`body` re-embeds the item (`title + "\n\n" + body`) synchronously in
the same request; a `url`-only update on a reference skips re-embedding.

#### Links (`/api/v1/spaces/{space_id}/items/{item_id}/links`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/links` | member | `{ other_item_id, relation? }` | `201` `LinkedItemOut` -- 400 on self-link or duplicate, 422 on unknown relation |
| GET | `/links` | member | -- | `LinkedItemOut[]` (both directions from `item_id`) |
| PATCH | `/links/{link_id}` | member | `{ relation }` | `LinkedItemOut` -- 404 if the link is not on this item |
| DELETE | `/links/{link_id}` | member | -- | `204` |

`LinkedItemOut`: `{ link_id, created_at, relation, direction_out, item: ItemOut }`.

The pair is canonically ordered (`item_a_id < item_b_id` by UUID comparison)
so a single `UNIQUE(item_a_id, item_b_id)` constraint rules out duplicates
and reverse links without app-level dedup logic.

##### Relations

`relation` is one of `related` (the default), `references`, `depends_on`,
`supersedes`, `part_of`. All but `related` are **directed**: "A supersedes B"
says something different from "B supersedes A".

Direction is stored in a separate `direction` column (`none` / `a_to_b` /
`b_to_a`) rather than by reordering the pair. Expressing "A supersedes B" as
`(a=B, b=A)` would have meant abandoning the canonical ordering, and with it
the UNIQUE constraint that makes reverse-duplicates impossible; keeping the
ordering and recording the semantic direction alongside it preserves both
properties at once.

A link is created *from* `item_id`, so that item becomes the source of a
directed relation regardless of which canonical column it lands in.

`direction_out` is resolved relative to the item being viewed -- `out`, `in`,
or `none` -- so a client rendering an item's link list can show
"References X" versus "Referenced by X" without redoing canonical-order
arithmetic.

`PATCH` exists because the UNIQUE pair constraint permits only one link per
pair, so retyping cannot be expressed as delete-then-recreate without a
window in which the link does not exist. It recomputes direction from the
endpoint the request came through, which is also how a directed relation
gets flipped: re-issue the same PATCH from the other item.

Both columns carry a server default (`related` / `none`), so a client that
omits `relation` behaves exactly as it did before relations existed.

#### Graph (`/api/v1/spaces/{space_id}/graph`)

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/graph` | member | `{ nodes: GraphNode[], edges: GraphEdge[] }` |

`GraphNode`: `{ id, title, kind }`.
`GraphEdge`: `{ id, source, target, relation, directed }` (item IDs).

Edges are emitted in **relation order**, not storage order: `source` is the
"from" end of the relation, so a renderer can draw an arrowhead without
knowing anything about canonical column ordering. For undirected relations
`source`/`target` fall back to canonical order and `directed` is `false`.

Recomputed fresh on every request from `items`/`item_links` -- nothing is
cached.

#### Search (`/api/v1/spaces/{space_id}/search`)

| Method | Path | Auth | Query | Response |
|---|---|---|---|---|
| GET | `/search` | member | `q` (string, optional) | `SearchResult[]` |

`SearchResult`: `{ item: ItemOut, score: number }`. Empty/whitespace `q`
returns `[]` without a DB query. Backed by
`app.core.retrieval.retrieve_items` -- cosine similarity over the local
`sentence-transformers` embedding, top 20.

#### Grounded Q&A (`/api/v1/spaces/{space_id}/ask`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/ask` | member | `{ question (1-2000 chars) }` | `{ answer, sources: SearchResult[] }` |

One-shot, no conversation history. Retrieves top 8 items by embedding
similarity; if none are found, returns a fixed "no relevant information"
answer with `sources: []` **without calling the LLM** -- the app never lets
the model invent an ungrounded answer. Requires
`OPENROUTER_API_KEY`/`OPENROUTER_MODEL` to be set (see
[Environment variables](#environment-variables) above); otherwise fails with
a clear "not configured" error.

#### Conversations (`/api/v1/spaces/{space_id}/conversations`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/conversations` | member | `{ title? (default "New conversation") }` | `201` `ConversationOut` |
| GET | `/conversations` | member | -- | `ConversationOut[]`, newest-updated first |
| GET | `/conversations/{id}` | member | -- | `ConversationDetailOut` (adds `messages: MessageOut[]`) |
| DELETE | `/conversations/{id}` | member | -- | `204` |
| POST | `/conversations/{id}/messages` | member | `{ question (1-2000 chars) }` | `201` `MessageOut` (the assistant's reply) |
| POST | `/conversations/{id}/end` | member | -- | `MemoryOut \| null` |

Posting a message stores the user message, retrieves grounding context (same
retrieval as `/ask`), pulls in any active space-level memory summaries, and
feeds the LLM up to the most recent `MAX_HISTORY_MESSAGES` (20) prior
messages as history -- a fixed ceiling regardless of how long the
conversation has grown. `MessageOut.sources` is a JSONB snapshot (`item_id`,
`title`, `kind`, `score`) taken at answer time, not a live join, so history
still renders correctly if a cited item is later deleted.

Ending a conversation asks the LLM to summarize it into durable facts under a
prompt that explicitly forbids inventing facts not in the transcript and must
respond with the literal sentinel `NONE` when nothing is worth remembering --
`end` returns `null` in that case, or if the conversation has no messages.
Summaries expire `MEMORY_TTL_DAYS` (default 30) after creation.

#### Memory (`/api/v1/spaces/{space_id}/memory`)

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/memory` | member | `MemoryOut[]` (only non-expired) |
| DELETE | `/memory/{memory_id}` | member | `204` |

`MemoryOut`: `{ id, space_id, conversation_id, content, created_at, expires_at }`.
Memory is **shared at the space level**, not private per user -- a summary
from one member's conversation is visible to every other member of the same
space.

#### Suggested links (`/api/v1/spaces/{space_id}/items/{item_id}/suggested-links`)

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/suggested-links` | member | `SearchResult[]` (up to 5) |

Pure embedding cosine-similarity over other items in the space, excluding the
item itself and anything already linked to it. No LLM call, nothing
persisted -- recomputed on every request. "Approve" in the UI is not a
separate write path; it calls the same `POST .../items/{item_id}/links`
endpoint as a manual link, so a suggestion becomes a real link only by going
through the same validation (dedup, self-link rejection) as any other link.

#### Health

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | none | `{ status: "ok" }` -- liveness only |
| GET | `/health/db` | none | `{ status: "ok" }`, or `503 { status: "unavailable" }` if `SELECT 1` fails |

#### Regenerating this section

Re-derive this reference from `apps/api/app/api/v1/*.py` and
`app/schemas/*.py` after any route or schema change, rather than
hand-editing it out of sync with the code.

## Frontend architecture

Next.js (App Router) frontend for Mnemo.

### Routing

Next.js App Router, all routes under `apps/web/app/`:

| Route | Purpose |
|---|---|
| `/login` | Mock sign-in (pick a seeded account, no password) |
| `/spaces` | List/create spaces the user belongs to |
| `/spaces/[spaceId]` | Space overview |
| `/spaces/[spaceId]/items/[itemId]` | Item detail: view/edit, manual links, AI-suggested links |
| `/spaces/[spaceId]/search` | Semantic search over the space's items |
| `/spaces/[spaceId]/graph` | Interactive physics-based knowledge graph |
| `/spaces/[spaceId]/ask` | One-shot grounded Q&A |
| `/spaces/[spaceId]/conversations` | Conversation list |
| `/spaces/[spaceId]/conversations/[conversationId]` | Multi-turn grounded Q&A with history |
| `/spaces/[spaceId]/memory` | Persistent memory summaries for the space |

Two layouts: `app/spaces/layout.tsx` (bare `TopBar`, wraps the `/spaces` list
page) and `app/spaces/[spaceId]/layout.tsx` (adds the persistent `Sidebar`
nav for every space-scoped route). This split exists because `/spaces`
itself has no single space to scope a sidebar to; every space-scoped route
is wrapped in `RequireAuth` (`components/RequireAuth.tsx`).

### Auth flow

`lib/auth-context.tsx`'s `AuthProvider` calls `GET /api/v1/auth/me` once on
mount and holds `{ user, loading }` in React context via `useAuth()`.
There's no client-side token; the session lives in an httpOnly cookie the
browser sends automatically (`credentials: "include"` on every `fetch`, set
in `lib/api-client.ts`).

`components/RequireAuth.tsx` wraps every space-scoped page: while `loading`
it renders a loading state; once resolved, if `user` is null it
`router.replace("/login")`. Because the check is client-side (an effect, not
middleware), a logged-out user briefly sees the loading state before the
redirect fires rather than being blocked at the routing layer -- acceptable
for the MVP's mock-auth scope, called out here as a known simplification
rather than an oversight.

### Data fetching

There is no server-side data fetching layer (no Route Handlers proxying the
API, no `getServerSideProps`-equivalent) -- every page is a Client Component
that calls the FastAPI backend directly from the browser via
`lib/api-client.ts`:

```ts
export const api = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", ... }),
  patch:  <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", ... }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
```

Every call sets `credentials: "include"` (session cookie auth, no bearer
tokens) and throws a typed `ApiError` (`status`, `code`, `message`) on any
non-2xx response, parsed from the backend's
`{ error: { code, message, request_id } }` envelope (`app.core.errors` on
the API side). Pages catch `ApiError` to drive their error-state UI; `code`
lets a page distinguish, e.g., a 404 from a 400 without string-matching
`message`.

`lib/types.ts` hand-mirrors the API's Pydantic response schemas -- there is
no codegen or shared schema package between the two apps. A backend schema
change (new field, renamed field, new endpoint) requires a matching manual
edit to `lib/types.ts`; see [API reference](#api-reference) above for the
schemas to keep in sync.

### Component layout

| Path | Contents |
|---|---|
| `components/ui/` | Presentational primitives (`Button`, `Card`, `GlassPanel`, `Input`, `Textarea`, `Select`, `Badge`, `EmptyState`, `ErrorMessage`, `LoadingState`, `ListRow`, `MotionList`) -- thin styled wrappers over native elements, kept semantic on purpose (see [Frontend testing](#frontend-testing) above) |
| `components/layout/` | `TopBar`, `Sidebar` (space-scoped nav shell) |
| `components/graph/` | The knowledge-graph module: `GraphCanvas` (all canvas painting), `GraphToolbar`, `GraphFilterPanel`, `GraphLegend`, `GraphMinimap`, `FocusBreadcrumb`, `NodeTooltip`, `NodeDetailPanel`, plus `useGraphModel` / `graphTheme` / `nodeInfo` |
| `components/` (root) | Domain components: `ItemList`, `ItemCreateForm`, `ItemLinkPicker`, `SuggestedLinks`, `SpaceCreateForm`, `SpaceSwitcher`, `MemberInviteForm`, `GraphView`/`GraphViewInner`, `AmbientBackground`, `RequireAuth`, `MnemoLogo`, `UstMark` |
| `lib/` | `api-client.ts`, `types.ts`, `auth-context.tsx`, `cn.ts` (clsx + tailwind-merge), `motionTokens.ts`, `relations.ts` (relation labels, colours and dash patterns), `text.ts` |

Pages under `app/` compose these components and own their own data-fetching
(`useEffect` + `api.get`), loading/empty/error conditionals, and mutation
calls directly -- there's no shared data-fetching hook or client-side cache
(no React Query/SWR); each page manages its own `useState` for fetched data.

`GraphView`/`GraphViewInner` is a two-component split
(`next/dynamic(..., { ssr: false })`) because `react-force-graph-2d` touches
`window`/canvas at module load time and isn't SSR-safe -- see
[Design system](#design-system) below for the full knowledge-graph module
breakdown.

### Known simplifications

- No SSR/server-fetched initial data -- every page fetches client-side after
  mount.
- No shared client-side cache -- navigating between pages re-fetches.
- No codegen between backend schemas and `lib/types.ts` -- kept in sync by
  hand.
- Auth gating is client-side only (see [Auth flow](#auth-flow) above), not
  enforced at the routing/middleware layer.

These are documented here as explicit MVP boundaries, not
silently-accumulated debt.

### Design system

This documents the frontend-only redesign that introduced Mnemo's first
shared design-token/component layer (previously every page/component
hand-wrote Tailwind utility classes with no shared primitives) and
restructured navigation from a single top header row into a persistent
sidebar + top bar, modeled on the structural pattern of an internal UST
Square reference screenshot. No backend, API, route param, or
`lib/api-client.ts`/`lib/types.ts` change was made -- every page's
data-fetching logic, loading/empty/error conditionals, and button
disabled/label-swap behavior are unchanged from before the redesign; only
the JSX/styling inside each branch changed.

A later pass (documented under "Glass design system", "Typed relations" and
"Knowledge graph" below) layered a frosted-glass visual language over this,
and did change the backend -- item links are now typed.

#### Design tokens

`app/globals.css` extends Tailwind v4's CSS-first `@theme inline` block
(there is no `tailwind.config.*` in this project) with a
`--color-brand-{50..900}` teal scale and
`--color-surface`/`--color-surface-muted`/`--color-border` neutral tokens.
Because Tailwind v4 auto-derives utilities from any `--color-*` token
declared in `@theme`, this makes `bg-brand-700`, `text-brand-600`,
`border-border`, etc. available as ordinary utility classes with no extra
plugin config. Domain-meaningful colors (the three item-kind colors used on
graph nodes and kind badges, error-message red) were deliberately left
alone -- this redesign only restyles chrome/UI color, not colors that
already carry meaning.

#### Shared primitives

`components/ui/` (new) holds the first reusable presentational layer:
`Button`, `Card`, `Input`, `Textarea`, `Select`, `Badge`, `EmptyState`,
`ErrorMessage`, `LoadingState`, `ListRow`. Each is a thin styled wrapper over
its native element -- `Button` still renders a real `<button>`, `Select` a
real `<select>` -- specifically so the existing Vitest suite (which queries
by role/label/text, e.g. `getByRole("button", { name: "Add" })`) kept
passing unmodified through the whole redesign. `lib/cn.ts` wraps `clsx` for
conditional className joining.

#### Navigation shell

`components/layout/TopBar.tsx` (slim dark-teal bar: Mnemo wordmark, user
name, log out, a small secondary UST co-brand mark) replaces the old inline
`Header()` that used to live directly in `app/spaces/layout.tsx`.
`components/layout/Sidebar.tsx` (space-scoped nav:
Overview/Search/Graph/Conversations/Memory, active-state via
`usePathname()`, hosts the `SpaceSwitcher`) is mounted by a new
`app/spaces/[spaceId]/layout.tsx` that wraps only the space-scoped routes --
the plain `/spaces` list page keeps `TopBar` only, matching its pre-redesign
nav-less structure. Neither the Mnemo nor UST mark has a real brand-asset
file anywhere in this repo; both are small inline SVG/text components built
in code (`components/MnemoLogo.tsx`, `components/UstMark.tsx`).

Below Tailwind's `md` breakpoint the sidebar becomes an off-canvas panel (a
`translate-x` transform + backdrop, toggled by a `Menu` button
`[spaceId]/layout.tsx` renders inline) rather than squeezing page content
into a few hundred pixels -- there was no existing responsive-nav pattern in
this app to build on, since the old single-row header never had this
problem. The panel stays CSS-transform-driven on purpose: Motion writes
transform via inline style, which would always beat a Tailwind `md:` utility
regardless of viewport.

One pre-existing e2e assertion had to be updated because of the new
persistent sidebar: `tests/e2e/smoke.spec.ts` used an unscoped
`page.getByRole("combobox")` to find `ItemLinkPicker`'s "link to..." select
on the item detail page, which was unambiguous before the sidebar existed.
Since `SpaceSwitcher`'s combobox now renders on every space-scoped page,
that selector became ambiguous and was scoped. No test assertion's *intent*
changed, only its scope. (This has since happened twice more -- see
"Knowledge graph" below.)

#### Glass design system

A second pass layered a frosted-glass visual language over the token system
above.

`app/globals.css` gained a `--glass-*` vocabulary -- background, border,
blur, tinted shadow and radius -- plus three utilities declared with
Tailwind v4's `@utility`: `glass`, `glass-strong`, `glass-subtle`. They are
`@utility` blocks rather than plain CSS classes specifically so they land in
the utilities layer and stay overridable by a caller's `className`; a plain
class defined after `@import "tailwindcss"` would beat any utility passed
in, making `<Card className="bg-white">` silently impossible.

The three opacity steps carry an accessibility obligation, not just a look:

| Utility | White | Use |
|---|---|---|
| `glass-strong` | 80% | the only step body text may sit on |
| `glass` | 62% | panels, cards, chrome with short labels |
| `glass-subtle` | 45% | decorative chrome and chips only |

Two non-obvious details are load-bearing:

- **`-webkit-backdrop-filter` is authored *before* the standard property.**
  Lightning CSS (Turbopack's minifier) collapses the pair and keeps
  whichever comes last, so the natural ordering shipped the `-webkit-` form
  alone -- which Firefox does not implement, leaving glass as an unreadable
  flat wash there.
- **A `@supports not (backdrop-filter)` block raises every glass surface to
  near-opaque.** Where blur is unavailable, the effect is traded for
  legibility.

`components/AmbientBackground.tsx` paints the field the glass refracts:
slow-drifting teal blooms behind the whole app, frozen under
`prefers-reduced-motion` and grain-dithered to stop the large low-contrast
gradients from banding. Without something behind the glass,
`backdrop-filter` produces no visible effect and panels just read as
translucent white.

`components/ui/GlassPanel.tsx` is the floating-overlay surface (graph
toolbars, legend, minimap, detail panels); `Card` remains the in-flow
document surface. Both draw from the same tokens, but only one is allowed to
float over a canvas.

`lib/cn.ts` gained `tailwind-merge`. It was previously plain `clsx`, so a
`className` prop *appended* rather than overrode and conflicts resolved by
generated-stylesheet order -- every `<Card className="...">` override was a
coin flip. The three glass utilities are registered as one conflict group so
they collapse rather than stack, and `radius`/`shadow` theme keys are
registered so `rounded-glass` and `shadow-glass` are recognised as the
utilities they are.

The brand ramp was also repaired: `brand-400/500/600/800` had all been the
identical `#036e74` while `brand-700` was *lighter* than 600, so `Button`'s
`bg-brand-700 hover:bg-brand-800` darkened on hover only by accident.

#### Typed relations

`item_links` now carries a `relation` and a `direction`; see
[API reference](#api-reference) above for the vocabulary, the
storage-versus-relation ordering, and why `PATCH` exists.

On the frontend, `lib/relations.ts` is the single source of truth for how
each relation is *presented* -- label, inverse label, colour and dash
pattern -- shared by the canvas painter, the link picker, the filter panel
and the legend. Colours are hex literals rather than tokens because a 2D
canvas context cannot resolve a CSS variable, and every relation also
carries a dash pattern so its type survives without colour, both for
colourblind readers and at zoom levels where a sub-pixel line carries almost
no perceptible hue.

`ItemLinkPicker` shows the current relation as a badge -- including the
*inverse* wording ("Referenced by") when the relation points at the item
being viewed -- beside a select that is a pure action control, since
choosing an option always means "make this item the source".

#### Knowledge graph

`components/graph/` replaces what was a single 445-line `GraphViewInner`:

| File | Role |
|---|---|
| `GraphCanvas.tsx` | `ForceGraph2D` plus every canvas painter |
| `GraphToolbar.tsx` | search, zoom, fit, reset, fullscreen |
| `GraphFilterPanel.tsx` | kind / relation / connection filters |
| `GraphLegend.tsx` | documents both colour encodings |
| `GraphMinimap.tsx` | overview plus live viewport rectangle |
| `FocusBreadcrumb.tsx` | focus target and depth control |
| `NodeTooltip.tsx` / `NodeDetailPanel.tsx` | hover and selection surfaces |
| `useGraphModel.ts` | adjacency, degree, radius, curvature, BFS depth |
| `graphTheme.ts` | canvas colours read from CSS custom properties |
| `nodeInfo.ts` | one resolver behind both the tooltip and the panel |

`GraphViewInner` remains the target of `GraphView`'s
`next/dynamic(..., { ssr: false })` import, which must not change --
`react-force-graph-2d` touches `window` at module load and is not SSR-safe.

The page is full-bleed: the canvas fills everything below the `h-14` TopBar
and all chrome floats over it as frosted overlays. It was previously boxed
into a fixed 600px panel inside a `max-w-4xl` column, which is the single
biggest reason a graph of any size felt cramped.
`app/spaces/[spaceId]/graph/page.tsx` now owns data fetching and nothing
else; filtering, search and focus live inside the graph module because the
controls that drive them float over the canvas and need the same
force-graph handle it does.

`graphTheme.ts` reads canvas colours from the same CSS custom properties as
the rest of the app. Before it existed, the graph hardcoded its own hex
values, and they had silently drifted out of sync with `globals.css` -- the
constants were still annotated with the names of palette entries whose
values had since changed.

##### Physics

The graph previously ran on pure d3-force defaults -- charge `-30`, link
distance `30`, and **no collision force registered at all**, which is why
nodes overlapped. Forces are now configured imperatively after mount
(force-graph exposes the live d3 forces rather than accepting them as
props):

| Force | Setting | Why |
|---|---|---|
| charge | `-180 - min(n, 400) * 0.8`, `distanceMax(600)` | scales with node count so density stays roughly constant; the bound cuts far-field work and stops distant clusters dragging on each other |
| link distance | `60 + 12 * min(deg(s) + deg(t), 12)` | gives hubs room to breathe |
| link strength | `1 / (1 + min(deg(s), deg(t)))` | stops a hub reeling its neighbours into an unreadable rosette |
| collide | `radius + 14`, 2 iterations | hard no-overlap, and the gutter is the headroom labels need to be placeable at all |
| center | removed | it yanks the centroid to the origin, fighting every pan |
| x / y | `forceX(0).strength(0.03)`, `forceY(0).strength(0.04)` | gentle centring, biased wider than tall to match the viewport |

Plus `d3VelocityDecay 0.28`, `cooldownTicks 200`, and `warmupTicks 80` above
150 nodes so large graphs settle before first paint instead of exploding on
screen. A `zoomToFit` on `onEngineStop` means the view arrives framed --
there was no `zoomToFit` anywhere previously.

Node radius derives from degree (`clamp(4 + 3.2 * sqrt(deg), 4, 16)`), so
hubs read as hubs; every node was previously a flat 5px dot regardless of
importance.

##### Level of detail

Labels did not exist at all before this pass; a node's identity could only
be discovered by hovering it one at a time. `globalScale` now drives four
thresholds:

| Zoom | Behaviour |
|---|---|
| `< 0.6` | no labels; nodes read as plain dots |
| `0.6 – 1.4` | top 12 nodes by degree only |
| `>= 1.4` | every node labelled |
| `>= 1.6` | edge relation names appear without hover |
| `> 0.9` | arrowheads drawn on directed edges |

Anything being engaged with -- hovered, adjacent to the hover, matched by
search, or inside the focused neighbourhood -- keeps its label at any zoom.

Node labels are painted in `onRenderFramePost` rather than inside
`nodeCanvasObject`, for two reasons: this component then controls their
paint order (degree-descending, so when two labels collide the
better-connected node keeps its name), and every label lands above every
edge instead of being overdrawn by later-painted links. Placement is
collision-tested against already-placed boxes, which is what keeps a dense
graph from becoming a wall of text.

Edges are quadratic Béziers with a deterministic per-edge bow hashed from
the edge id (so an edge always curves the same way across renders). In a
dense region a bundle of straight segments through the same corridor cannot
be traced by eye, whereas gently bowed edges separate visually even when
their endpoints nearly coincide.

Line widths and dash lengths are divided by `globalScale` so they stay
constant in screen pixels; a fixed graph-space width vanishes when zoomed
out and turns into a slab when zoomed in.

##### De-emphasis

Two independent systems narrow what is visible, and they compose by taking
the lower alpha:

- **Focus mode** (click a node): 1-hop full, 2-hop 55%, everything else 6%.
- **Hover/selection**: non-adjacent nodes drop to 16%.

While focus is active it *owns* de-emphasis, and only a live hover narrows
further. Without that rule the two fought for the same pixels: clicking sets
both selection and focus, so selection dimming pinned every 2-hop node at
16% and the 1/2/All depth control changed the breadcrumb count while
changing almost nothing on screen.

Escape unwinds one layer at a time -- focus, then selection, then search --
so it never discards more context than was asked for.

##### Motion

Idle drift amplitude decays with node count and switches off entirely on
dense graphs, and the pulse is reserved for the node being engaged with.
Constant-amplitude drift plus an always-on pulse on every node made a large
graph shimmer, which was itself a major part of the cluttered feeling. Edge
particles run only on edges touching the active node, rather than every
edge carrying a perpetual travelling dot.

`autoPauseRedraw` was previously inverted. force-graph's gate is
`!autoPauseRedraw || needsRedraw || isEngineRunning()`, so passing
`!prefersReducedMotion` *paused* repainting for every user who had **not**
asked for reduced motion -- silently freezing the drift, pulse and particle
animation the file existed to draw. It is now tied to whether anything is
actually animating, so a settled graph with nothing hovered stops burning
frames.

Edges are drawn by hand (`linkCanvasObjectMode="replace"`) rather than via
`linkColor`/`linkWidth`, because force-graph's own link renderer reads the
raw, undrifted endpoint positions -- lines would visibly detach from nodes
painted at a drifted offset.

##### Performance

The per-node phase hash was previously recomputed for every node and every
link endpoint on every frame -- three walks of a 36-character UUID per node
at 60fps. It, along with degree, radius, curvature and resolved colour, is
now computed once per graph in `useGraphModel`. The minimap repaints at
~8fps rather than per frame, and takes the main canvas size as a prop rather
than reaching for `document.querySelector("canvas")`, which would match
whichever canvas comes first now that the minimap renders one of its own.

Two existing patterns are preserved deliberately, and breaking either
reintroduces a solved bug: the `graphData` memo on `[nodes, edges]`, and
hover state living in a ref rather than React state. force-graph re-heats
the entire simulation and wipes its hit-test colour registry whenever it
receives node objects it has not seen before -- which a fresh `{ ...node }`
copy always is -- so unmemoised data restarted the physics and reassigned
hit-test colours on every mouse-move.

Hit-testing runs on an offscreen canvas force-graph repaints on an internal
800ms throttle, so `nodePointerAreaPaint` paints the hit area at each node's
*undrifted* base position, inflated to cover the whole drift envelope.
Otherwise hover goes stale between repaints as nodes float away from where
the hit map last recorded them.

##### Test selector impact

Two committed selectors had to be re-scoped, both because a new element made
a previously unambiguous query ambiguous, and neither changing any
assertion's intent:

- `tests/ItemLinkPicker.test.tsx` and `tests/e2e/smoke.spec.ts`: the
  relation-type combobox joined the item combobox, so both are now selected
  by accessible name.
- `tests/e2e/smoke.spec.ts`: the minimap adds a second `<canvas>`, so
  `locator("canvas")` is scoped to `.first()`.
