# Mnemo API

FastAPI backend for Mnemo: space-scoped notes/documents/references, a manual
knowledge graph, semantic search, and grounded Q&A with persistent memory. See the
root `README.md` for one-time Postgres setup and `docs/architecture/` for the
conventions this app is built on (space isolation, RLS, embeddings, memory).

## Requirements

- Python >=3.12, with dependencies installed via plain `pip`/`venv` (see Setup below)
- PostgreSQL 18, plain and stock (no extensions needed), with a non-superuser
  `mnemo_app` role (see root `README.md` -- Postgres Row-Level Security is silently
  bypassed by superusers, so this project cannot run correctly against a superuser
  connection)

## Setup

For installing Python/PostgreSQL 18 from scratch and creating the database, see
[`docs/SETUP.md`](../../docs/SETUP.md). Once those are in place:

```bash
cd apps/api
cp .env.example .env
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install httpx pytest pytest-asyncio   # only needed to run tests
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

`requirements.txt` is the pinned dependency list matching `pyproject.toml`;
maintainers update it by hand (or with `pip freeze` from an up-to-date venv)
whenever a dependency in `pyproject.toml` changes.

The first install pulls in `sentence-transformers` (and `torch`) for
local embeddings, and the first server start downloads the `all-MiniLM-L6-v2` model
(~90MB) to the local Hugging Face cache. Both are one-time costs. `app/main.py`'s
`lifespan` warms the model at startup (not on first request) so a fresh `uvicorn`
start pays this cost before reporting healthy, not on the first real request. If your
network sits behind a TLS-intercepting corporate proxy and this download fails with an
SSL error, see `HF_SSL_VERIFY` below.

Server runs at `http://localhost:8000`; interactive API docs at `/docs`.

## Environment variables

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

See `app/config.py` for the full `Settings` model.

## Admin scripts

These run with a database-owner connection (like Alembic migrations), not the
app's restricted `mnemo_app` role, because they need to see across every space --
RLS correctly blocks the app role from doing that:

```bash
# Backfill embeddings for items created before embeddings existed, or after
# changing the embedding model
DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" python -m app.backfill_embeddings

# Physically delete memory summaries past their TTL (they're already filtered out
# of reads once expired -- this just reclaims storage)
DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" python -m app.cleanup_expired_memories
```

## Testing

In the activated venv:

```bash
DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" pytest
```

`tests/test_isolation.py` is the standing cross-space regression suite (app-layer
checks, a raw-SQL check that RLS holds independent of the ORM, and a check that an
unset RLS context denies by default) -- extend it, don't replace it, when adding a
new space-scoped table. Every test mocks external calls (`generate_completion` for
OpenRouter); nothing in the suite makes a real network call.

## Module layout

| Path | Contents |
|---|---|
| `app/api/v1/` | Route modules, one per resource (see `docs/architecture/api-reference.md`) |
| `app/auth/` | Mock auth (`mock_auth.py` -- the only file to change when swapping in a real identity provider), session store, `dependencies.py` (the `get_current_user`/`get_current_space` choke points) |
| `app/core/` | Cross-cutting logic: RLS activation (`query_scoping.py`), embeddings, retrieval, LLM gateway (`llm.py`), prompting, error types, logging, request-ID middleware |
| `app/models/` | SQLAlchemy models; space-scoped tables inherit `mixins.SpaceScopedMixin` |
| `app/schemas/` | Pydantic request/response models |
| `app/db/migrations/` | Alembic migrations (the source of truth for schema + RLS policies) |
| `app/seed.py` | Seeds the three mock accounts used for local login |

For the conventions behind this structure (space isolation, RLS gotchas, embedding
lifecycle, LLM gateway design, memory bounding), see `docs/architecture/milestone-1-foundations.md`
and its per-milestone addenda, and `docs/architecture/api-reference.md` for the full
endpoint reference.
