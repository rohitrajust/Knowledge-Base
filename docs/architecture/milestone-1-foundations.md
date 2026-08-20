# Milestone 1 Foundations: Isolation, Auth, and Conventions for Later Milestones

This document captures the conventions established in Milestone 1 (Foundational
platform & project isolation) that every later milestone (capture, graph, semantic
search, grounded Q&A, memory, team collaboration) should build on rather than
reinvent.

## The `space_id` convention

Every tenant-scoped table -- starting with `space_memberships` in this milestone, and
every content table added later (`notes`, `documents`, `references`, `note_embeddings`,
`graph_edges`, `conversations`, `messages`, `memory_entries`, ...) -- gets:

- `space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE`, indexed
- A SQLAlchemy model inheriting `app.models.mixins.SpaceScopedMixin`
- Row-Level Security enabled and forced (see below)
- All reads/writes going through `app.core.query_scoping`, never an ad hoc query

`spaces` itself is the boundary table, not "content" -- it doesn't have a `space_id`
column and is scoped differently (see below).

## Isolation is enforced by two independent layers

1. **App layer**: `app.auth.dependencies.get_current_space` is the single choke point.
   It resolves `space_id` from the URL path, verifies a `space_memberships` row exists
   for `(space_id, current_user)`, and 404s (not 403) if not -- this avoids confirming a
   space's existence to non-members. Every space-scoped route depends on it. A
   client-supplied `space_id` in a request body is never trusted.
2. **Database layer (Postgres RLS)**: `space_memberships` and `spaces` have Row-Level
   Security enabled and **forced** (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`), so even
   a future query that forgets to go through `query_scoping.py` still can't leak data
   across spaces. See `db/migrations/versions/0002_enable_pgvector_and_rls.py` for the
   policy definitions and extensive inline commentary on two non-obvious gotchas:
   - **Connecting role matters.** Postgres superusers and any role with `BYPASSRLS`
     silently ignore RLS regardless of `FORCE`. The app (and tests) must connect as a
     dedicated, non-superuser role (`mnemo_app` locally) or RLS is a no-op. Verify with
     `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;` --both
     should be `false`.
   - **`current_setting(name, true)` returns `''`, not `NULL`, once touched.** After the
     first `set_config('app.foo', ..., true)` in a session, later transactions where
     that LOCAL value resets see `''`, and `''::uuid` raises `invalid input syntax`
     instead of evaluating to NULL. Every policy expression casting a session variable
     must wrap it in `NULLIF(current_setting(name, true), '')::uuid`. This matters even
     for policies that "shouldn't" be reached for a given query: Postgres does not
     guarantee left-to-right short-circuit evaluation between OR'd permissive RLS
     policies, so an unrelated, never-activated variable can still get evaluated and
     throw.

Two session variables drive RLS, both set once per request:

- `app.current_user_id` -- set by `activate_rls_for_user`, called from
  `get_current_user` on every authenticated request. Used by `spaces`' own SELECT
  policy (membership via subquery) and by `space_memberships`' self-select policy, so
  "list my spaces" works without pre-activating any specific space.
- `app.current_space_id` -- set by `activate_rls_for_space`, called from
  `get_current_space`. Used by policies on `space_memberships` (and, from milestone 2
  onward, every content table) once a specific space's membership has been verified.

**Gotcha for future content-table inserts**: `INSERT ... RETURNING` requires the new row
to satisfy the table's SELECT policy, evaluated *before* any row that would make it
visible necessarily exists yet (e.g. creating a space before its owner-membership row
exists). Where this chicken-and-egg problem applies, use a Core `insert()` (no implicit
`RETURNING`) followed by a plain `SELECT` once the row that grants visibility exists --
see `create_space` in `app/api/v1/spaces.py` for the pattern.

## Mock auth swap-out path

`app/auth/mock_auth.py` is the only file that should change when mock auth is replaced
with a real identity provider. `sessions` (an opaque, server-side, revocable session
store), `get_current_user`, and `get_current_space` are designed to be identity-provider
agnostic and should not need to change.

## Local Postgres setup

A dedicated, non-superuser role is required for RLS to actually apply:

```sql
CREATE ROLE mnemo_app WITH LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mnemo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mnemo_app;
GRANT USAGE ON SCHEMA public TO mnemo_app;
```

`DATABASE_URL` in `.env`/`.env.example` connects as `mnemo_app`, not the superuser used
to run migrations. Run migrations as your regular (superuser) local role; the app and
tests connect as `mnemo_app`.

## Testing

`apps/api/tests/test_isolation.py` is the standing regression suite: cross-space app
layer checks, a raw-SQL check that RLS holds independent of the ORM, and a check that an
unset RLS context denies by default. Extend it, don't replace it, as content tables are
added in later milestones.

## Addendum (Milestone 2): the convention held

`items` (notes/documents/references, milestone 2's first content table) followed this
document's convention with zero changes needed to `get_current_space`,
`query_scoping.py`, or the mock-auth layer -- only a new model inheriting
`SpaceScopedMixin`, a migration adding `ENABLE`/`FORCE ROW LEVEL SECURITY` plus the four
per-command policies (SELECT/INSERT/UPDATE/DELETE, since content tables need all four
unlike `spaces`), and routes depending on `get_current_space` like every other
space-scoped route. `apps/api/tests/test_isolation.py` was extended in place (not
duplicated) with an items-specific cross-space case, confirming the pattern generalizes
as intended.

One new gotcha surfaced: `onupdate=func.now()` columns (e.g. `items.updated_at`) are not
always eagerly refreshed after an ORM `UPDATE` flush -- accessing them during FastAPI's
response serialization can raise `MissingGreenlet` if the attribute was left "expired."
Call `await db.refresh(item)` after `db.flush()` for any update endpoint that returns a
model with a server-side `onupdate` column (see `update_item` in
`apps/api/app/api/v1/items.py`).

## Addendum (Milestone 3): the convention held again, plus a canvas/SSR gotcha

`item_links` (at the time, undirected and unlabeled links between two items -- they
have since gained a `relation` and a `direction`, see
`docs/architecture/api-reference.md`) followed the same convention as
`items`: `SpaceScopedMixin`, `ENABLE`/`FORCE ROW LEVEL SECURITY` with all four
per-command policies, and routes depending on `get_current_space`. The one new backend
technique: canonical pair ordering via a single `CHECK (item_a_id < item_b_id)`
constraint (UUID comparison in Postgres is a well-defined byte-wise operation), paired
with `UNIQUE(item_a_id, item_b_id)`, rules out both self-links and duplicate/reverse
links without any extra application-level dedup logic -- the app just sorts the pair
before inserting (`sorted([item_id, other_item_id])` in Python) and lets the DB enforce
the rest.

New frontend gotcha: `react-force-graph-2d` (and canvas/WebGL libraries generally)
touches `window`/canvas APIs at module load time and is not SSR-safe. Importing it
directly -- even inside a `"use client"` component -- breaks `next build`'s server
render pass, because Next.js still renders Client Components on the server for the
initial HTML. The fix is a two-component split: an inner component that does the real
`import "react-force-graph-2d"`, and an outer wrapper that loads the inner one via
`next/dynamic(() => import("./Inner"), { ssr: false })` (see
`apps/web/components/GraphView.tsx` / `GraphViewInner.tsx`). Any future canvas/WebGL UI
(e.g. embedding visualizations) should follow the same split rather than importing the
library directly.

## Addendum (Milestone 4): embeddings, and a lazy-load-vs-cold-start lesson

`items.embedding` is a nullable plain Postgres `float8[]` column (SQLAlchemy
`ARRAY(Float)`), not pgvector's `Vector` type -- this deliberately avoids requiring the
`pgvector` extension, which needs superuser/admin rights to install and isn't available
in every environment (managed databases, locked-down corporate machines). Similarity
search has no SQL-side ANN index; `app/core/retrieval.py` fetches a space's embedded
candidates and ranks them by cosine similarity in Python/numpy, which is fine at MVP
table sizes. RLS needed no changes: it's row-level, a new column doesn't touch it.

Embeddings come from a local `sentence-transformers` model (`all-MiniLM-L6-v2`), loaded
lazily via an `lru_cache`d `get_model()` in `app/core/embeddings.py` so that admin
scripts (Alembic, `app/backfill_embeddings.py`) importing `app.models` don't pay the
model-load cost. `SentenceTransformer.encode()` is synchronous and CPU-bound; every call
site goes through `embed_text()`, which runs it via `asyncio.to_thread` so it never
blocks the FastAPI event loop.

**Lazy-load caveat**: lazy loading is right for one-off scripts, but a *live server*
should warm the model at startup, not on the first request. `app/main.py`'s `lifespan`
now calls `get_model()` before the app reports ready -- without this, the first request
after a fresh `uvicorn` start pays the multi-second model-load cost inline, which is
invisible in casual manual testing but reliably broke Playwright's e2e test (a fresh
server process per run, with UI-assertion timeouts far shorter than a cold model load).
Any future startup-costly resource (a local LLM, a large index load) should warm the
same way.

**RLS and administrative scripts**: `app/backfill_embeddings.py` needs to see items
across every space, which RLS (correctly) won't allow the app's `mnemo_app` role to do.
Rather than weakening RLS, the script is documented as an administrative tool run with a
database-owner connection, the same way Alembic migrations already are -- the live app
never runs with that elevated access, only offline, reviewed, cross-tenant maintenance
scripts do.

## Addendum (Milestone 5): grounded Q&A, and testing external calls

`/ask` reuses milestone 4's embedding retrieval (now extracted into
`app/core/retrieval.py:retrieve_items`, shared with `/search`) and adds one new
external dependency: OpenRouter (https://openrouter.ai), used as a provider-agnostic LLM
gateway rather than a direct Anthropic/OpenAI SDK integration, so the app isn't tied to
one vendor and gets automatic fallback across models if the primary is rate-limited or
down. `app/core/llm.py` is the *only* module that knows OpenRouter specifically --
everything else calls `generate_completion(messages)`.

**No default model slug is configured.** OpenRouter's catalog of valid model slugs
changes over time, and hardcoding one risks shipping something stale or wrong.
`OPENROUTER_MODEL`/`OPENROUTER_FALLBACK_MODELS` ship empty; `/ask` fails fast with a
clear, actionable error ("set OPENROUTER_API_KEY and OPENROUTER_MODEL...") rather than a
confusing runtime API error, until they're set from https://openrouter.ai/models.

**Testing an external, paid, non-deterministic API**: every automated test mocks
`generate_completion` directly (`unittest.mock.patch("app.api.v1.qa.generate_completion", ...)`)
rather than calling OpenRouter for real -- this keeps the suite free, fast, and
deterministic, consistent with every other external dependency in this project (the
embedding model runs locally; there's no other paid call to reason about). Live
end-to-end verification of the real LLM path requires a real API key and is a manual
step, explicitly not covered by the automated suite.

## Addendum (Milestone 6): conversations, memory, and a request-timeout lesson

`conversations`, `messages`, and `memory_summaries` follow the established convention
(`SpaceScopedMixin`, RLS enabled+forced with 4 per-command policies each) with one
addition: `messages.space_id` is denormalized directly onto the table even though it's
also reachable via `conversation_id`, purely so RLS policies stay uniform (a filter on
`space_id`, not a join through `conversations`) across every table -- the same choice
already made for `item_links`. `messages.sources` is a JSONB snapshot
(`[{"item_id", "title", "kind", "score"}, ...]`) taken at answer time, not a live FK, so
conversation history renders correctly even if a cited item is later deleted.

**Memory is shared at the space level, not private per user** -- `MemorySummary` is
scoped only by `space_id`, so a summary from Alice's conversation is surfaced in Bob's
later conversation in the same space. This was made an explicit, tested decision (not
an implicit side effect of the schema) after review feedback on the milestone's plan.

**Bounding, not just noting.** Two things that could otherwise grow unboundedly were
given concrete bounds rather than left as "future work" risks: conversation history fed
into any LLM call is capped to the most recent `MAX_HISTORY_MESSAGES` (20, in
`app/core/prompting.py`), and the end-of-conversation summarization prompt
(`SUMMARY_SYSTEM_PROMPT`) explicitly forbids inventing facts not in the transcript and
must respond with the literal sentinel `NONE` when nothing is durable enough to
remember -- ending a conversation does not guarantee a memory gets created.

**Live-testing discovery: LLM calls need an explicit timeout.** While testing this
milestone against a real (free-tier) OpenRouter model, a client that disconnected
mid-request left the server-side request running indefinitely, holding its DB
transaction (and a row lock) open for as long as the upstream call took -- observed in
practice as several minutes of `idle in transaction` with the `conversations` row
locked, blocking other requests to the same row. `app/core/llm.py`'s `AsyncOpenAI`
client now has an explicit `timeout=60.0`, so a hung or very slow upstream call fails
fast as an `UpstreamError` instead of holding resources open indefinitely. Any future
code path that awaits an external call before its next flush/commit should have the
same kind of bound.

## Addendum (Milestone 7): AI-suggested links are stateless, and reuse the real write path

Link suggestions (`GET /spaces/{id}/items/{id}/suggested-links`) are pure embedding
cosine-similarity over `items.embedding` (`app/core/retrieval.py:suggest_related_items`)
-- no LLM call, no new table, nothing cached or persisted. They're recomputed on every
request, the same way `/search` and `/graph` already are; "dismiss" in the UI is
client-side only and never reaches the backend.

"Approve" is deliberately **not** a new write path: it calls the exact same
`POST .../items/{id}/links` endpoint milestone 3 built and already tests for RLS, dedup,
and self-link rejection. This milestone's only new surface is *finding* candidates, not
creating or storing links -- keeping "AI suggests, user approves" honest by construction
rather than by convention (there's no code path where a suggestion becomes a link
without going through the same validation a manually-created link does).

This milestone also reached the point where `get_item_or_404` had three near-identical
private copies (`items.py`, `links.py`, and now `suggestions.py`) -- extracted into
`app/core/item_lookup.py` alongside a new `get_linked_item_ids` helper (used by both
`links.py:list_links` and the suggestion-exclusion query), following this project's
established rule of thumb: two copies is fine, a third is the extraction signal.
