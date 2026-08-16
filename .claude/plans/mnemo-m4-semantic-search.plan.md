# Plan: Mnemo — Milestone 4: Semantic Indexing & Search

**Source PRD**: `.claude/prds/mnemo.prd.md`
**Selected Milestone**: 4 — Semantic indexing & search
**Complexity**: Medium-Large

## Context
Milestones 1-3 built the place to put and connect knowledge; nothing has made it *understandable* yet beyond manual browsing and the graph. Milestone 4 is where Mnemo starts to resemble its core hypothesis: content gets automatically embedded, and users can search it in natural language instead of scanning lists. This is also where the PRD's biggest open question gets resolved — "which embedding model and vector database" — and it's the foundation milestone 5 (grounded Q&A) builds retrieval on top of.

**Confirmed decisions** (already agreed with the user, not open for re-litigation in this plan):
- Embedding model: local, via `sentence-transformers` (`all-MiniLM-L6-v2`, 384-dim) — no API key, no external network call, no cost, consistent with the project's zero-external-services posture so far (mock auth, local Postgres). Lower quality than large hosted models, acceptable for MVP-scale search.
- Vector store: **pgvector**, already provisioned since Milestone 1's migration `0002` specifically to avoid this exact fork later. No separate vector database.
- Granularity: one embedding per item (title + body), not chunked — items are short-to-medium typed/pasted text (no real file uploads yet, per Milestone 2), so per-item embedding should retrieve well enough.
- Trigger: embeddings are computed **synchronously** on item create/update, inline in the request — no task queue/worker infrastructure.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Config | `apps/api/app/config.py` | Add `embedding_model_name` to `Settings`, same `get_settings()`/`lru_cache` pattern. |
| Lazy singleton | `apps/api/app/db/session.py` (`engine`, `async_session_factory` at module scope) | The embedding model loads once via an `lru_cache`d getter, not at import time — so commands like `alembic` that import `app.models` don't pay the model-load cost. |
| Migration + index | `apps/api/app/db/migrations/versions/0003_create_items.py`, `0004_create_item_links.py` | New migration `0005` follows the same file-naming/RLS-untouched (RLS is row-level, a new column needs no policy changes) pattern; adds an `hnsw` index for the new vector column. |
| Space-scoped query | `apps/api/app/core/query_scoping.py:scoped_select` | Search still filters through `scoped_select(Item, space_id)` before ranking by distance — isolation doesn't get a special case. |
| Router structure | `apps/api/app/api/v1/items.py`, `router.py` | New `app/api/v1/search.py` registered the same way. |
| Blocking work off the event loop | N/A (new pattern) | `sentence-transformers`' `.encode()` is a synchronous, CPU-bound call — must run via `asyncio.to_thread()`, not awaited directly, or it blocks the whole FastAPI event loop for every request while it runs. |
| Backend tests | `apps/api/tests/test_items.py`, `test_isolation.py` | Same `login_as`/`client` fixture pattern; extend `test_isolation.py` with a search cross-space case. |
| Frontend page structure | `apps/web/app/spaces/[spaceId]/graph/page.tsx` | Search is its own sub-page (`/spaces/{id}/search`) with a link from the space page header, same pattern as the graph page. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/pyproject.toml` | UPDATE | Add `sentence-transformers`, `pgvector` (the Python package, distinct from the already-enabled Postgres extension) |
| `apps/api/app/config.py` | UPDATE | Add `embedding_model_name: str = "all-MiniLM-L6-v2"` |
| `apps/api/app/core/embeddings.py` | CREATE | `get_model()` (lru_cache'd `SentenceTransformer` load), `async def embed_text(text: str) -> list[float]` (via `asyncio.to_thread`) |
| `apps/api/app/models/item.py` | UPDATE | Add `embedding: Mapped[list[float] \| None] = mapped_column(Vector(384), nullable=True)` using `pgvector.sqlalchemy.Vector` |
| `apps/api/app/db/migrations/versions/0005_add_item_embeddings.py` | CREATE | `ALTER TABLE items ADD COLUMN embedding vector(384)`, `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` |
| `apps/api/app/api/v1/items.py` | UPDATE | `create_item`/`update_item` compute and set `item.embedding` from title+body before flush |
| `apps/api/app/schemas/search.py` | CREATE | `SearchResult {item: ItemOut, score: float}` |
| `apps/api/app/api/v1/search.py` | CREATE | `GET /spaces/{space_id}/search?q=` — embeds the query, orders items by cosine distance |
| `apps/api/app/api/v1/router.py` | UPDATE | Register `search.router` |
| `apps/api/app/backfill_embeddings.py` | CREATE | Idempotent script (`uv run python -m app.backfill_embeddings`) to embed any item with `embedding IS NULL` — needed for items created before this migration, and reusable if the model ever changes |
| `apps/api/tests/test_search.py` | CREATE | Relevant results rank above irrelevant ones; empty-space search; excludes un-embedded items |
| `apps/api/tests/test_isolation.py` | UPDATE | Cross-space search case (space B's search never returns space A's items) |
| `apps/web/lib/types.ts` | UPDATE | Add `SearchResult` |
| `apps/web/app/spaces/[spaceId]/search/page.tsx` | CREATE | Search input + ranked results list, click-through to item detail |
| `apps/web/app/spaces/[spaceId]/page.tsx` | UPDATE | Add a "Search" link next to "View graph" |
| `apps/web/tests/e2e/smoke.spec.ts` | UPDATE | Extend: search for a captured note's title, confirm it's the top result |
| `docs/architecture/milestone-1-foundations.md` | UPDATE | Short addendum: embedding-column convention, `asyncio.to_thread` gotcha for blocking ML calls |
| `.claude/prds/mnemo.prd.md` | UPDATE | Mark Milestone 4 row, Plan cell → this file |

## Tasks

### Task 1: Dependencies + embedding module
- **Action**: `uv add sentence-transformers pgvector`. `app/core/embeddings.py`:
  ```python
  @lru_cache
  def get_model() -> SentenceTransformer:
      return SentenceTransformer(get_settings().embedding_model_name)

  async def embed_text(text: str) -> list[float]:
      return await asyncio.to_thread(lambda: get_model().encode(text).tolist())
  ```
  First run downloads the model (~90MB) to the local HF cache — expect a one-time delay.
- **Validate**: `uv run python -c "import asyncio; from app.core.embeddings import embed_text; print(len(asyncio.run(embed_text('hello'))))"` prints `384`.

### Task 2: Schema + migration
- **Action**: Add the `embedding` column to the `Item` model via `pgvector.sqlalchemy.Vector(384)`. Migration `0005`: `ADD COLUMN embedding vector(384)` (nullable — existing items get backfilled, not blocked), then `CREATE INDEX ix_items_embedding ON items USING hnsw (embedding vector_cosine_ops)` (hnsw, not ivfflat — ivfflat needs representative data to build a good index and performs poorly on near-empty tables; hnsw builds incrementally and is fine at MVP scale).
- **Validate**: `alembic upgrade head` clean on both DBs; `\d+ items` shows the new column and index.

### Task 3: Wire embedding generation into item create/update
- **Action**: In `create_item`, after building the `Item`, compute `await embed_text(f"{payload.title}\n\n{payload.body}")` and set it before `db.add`/flush. In `update_item`, if `title` or `body` changed, recompute the embedding the same way before flush (title/url-only changes to a reference still re-embed since title changed; a URL-only edit does not need re-embedding, but keeping the rule simple — "recompute whenever title or body is part of the update payload" — avoids stale-embedding bugs from being clever about it).
- **Validate**: manual httpx: create an item, `SELECT embedding IS NOT NULL FROM items WHERE id = ...` via psql confirms it's set immediately.

### Task 4: Search endpoint
- **Action**: `app/api/v1/search.py`: `GET /spaces/{space_id}/search?q=<text>` depends on `get_current_space`; embeds `q` via `embed_text`; queries `scoped_select(Item, space_id).where(Item.embedding.is_not(None)).order_by(Item.embedding.cosine_distance(query_vector)).limit(20)` (pgvector-python's `Vector` comparator gives `.cosine_distance()` directly usable in SQLAlchemy `order_by`); returns `SearchResult[]` with `score = 1 - distance`. Empty/whitespace `q` returns an empty list without calling the model.
- **Validate**: manual httpx: create a few items with clearly distinct topics, search for text close to one of them, confirm it ranks first.

### Task 5: Backfill script
- **Action**: `app/backfill_embeddings.py` mirrors `app/seed.py`'s structure: query all items where `embedding IS NULL`, embed and update each, commit. Run once against `mnemo_dev` to make existing milestone 1-3 test data searchable.
- **Validate**: `uv run python -m app.backfill_embeddings` against `mnemo_dev`; confirm no items remain with `embedding IS NULL`.

### Task 6: Backend tests
- **Action**: `test_search.py` — seed items with distinguishable content (e.g. "recipe for chocolate cake" vs "quarterly budget report"), search for a term close to one, assert it ranks above the other; search on an empty space returns `[]`; an item that somehow lacks an embedding is excluded, not errored on. Extend `test_isolation.py`: user B's search on their own space never surfaces user A's space's items (trivially true via `scoped_select`, but the explicit test documents the guarantee like everywhere else).
- **Validate**: `pytest apps/api/tests -v` green. Expect this suite to be slower than prior ones (real model inference) — note in the risks table.

### Task 7: Frontend
- **Action**: `SearchResult` type in `lib/types.ts`. `app/spaces/[spaceId]/search/page.tsx`: a text input, debounced or submit-on-enter query to `GET /api/v1/spaces/{id}/search?q=`, ranked results list (title, kind, snippet of body) linking to the item detail page — mirrors the graph page's fetch-and-render pattern. Add a "Search" link next to "View graph" on the space page.
- **Validate**: `npm run build` clean; manual browser check — create a couple of distinct items, search, confirm relevant one ranks first and clicking navigates correctly.

### Task 8: Docs + PRD
- **Action**: Addendum in `docs/architecture/milestone-1-foundations.md`: the embedding-column/index convention, the `asyncio.to_thread` requirement for any future blocking/CPU-bound call (embeddings today, possibly local LLM inference later), and a note that the PRD's "which embedding model/vector database" open question is now resolved (remove or check off that line in the PRD). Update the PRD milestone row.
- **Validate**: doc + PRD updated.

## Validation
```bash
# Backend
cd apps/api && uv run alembic upgrade head \
  && uv run python -m app.backfill_embeddings \
  && DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" uv run pytest -v

# Frontend
cd apps/web && npm run build && npm test

# Manual: create 3+ items with distinct topics in a space, use Search,
# confirm the most relevant item ranks first and clicking it navigates correctly
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| `sentence-transformers` pulls in `torch` — a large, slow first-time install | Medium | Expected and acceptable for local dev; note the one-time cost in `README.md`'s setup steps (Task 8) so it isn't mistaken for a hang |
| Blocking the event loop by awaiting `.encode()` directly instead of via `asyncio.to_thread` | Medium | Called out explicitly in Task 1/3; `test_search.py`'s real-model tests will be visibly slow (not hung) if this is done correctly, and every other concurrent request would stall if it's done wrong — worth a quick manual check hitting `/health` while a search request is in flight |
| hnsw index build time/behavior at MVP scale | Low | Table sizes here are tiny (dozens-hundreds of rows); not a real concern until much later, noted only for completeness |
| Existing (pre-migration) items having `embedding IS NULL` and silently never appearing in search | Medium | Task 5's backfill script + Task 4's explicit `.is_not(None)` filter (excludes, doesn't error) |

## Acceptance
- [ ] All 8 tasks complete
- [ ] `pytest apps/api/tests` green, including the search isolation case
- [ ] `npm test` and `npm run build` green
- [ ] Manual walkthrough: create distinct items, search, confirm ranking and navigation
- [ ] Backfill script run against `mnemo_dev`
- [ ] PRD Milestone 4 row updated to `complete`, embedding/vector-DB open question resolved
