# Mnemo

AI-native knowledge base for software engineering teams: shared spaces, semantic
search, grounded Q&A, and an interactive knowledge graph.

See `.claude/prds/mnemo.prd.md` for the product requirements and `.claude/plans/`
for milestone implementation plans.

## Documentation

See `docs/README.md` for the full documentation index -- architecture docs
(backend conventions, frontend structure, API reference), and pointers to the
per-app READMEs (`apps/api/README.md`, `apps/web/README.md`).

## Local development

Requires PostgreSQL (plain, stock -- no extensions needed) running locally.

### One-time database setup

```bash
createdb mnemo_dev
createdb mnemo_test
psql -d postgres -c "CREATE ROLE mnemo_app WITH LOGIN NOSUPERUSER NOBYPASSRLS;"
for db in mnemo_dev mnemo_test; do
  psql -d "$db" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mnemo_app;"
  psql -d "$db" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mnemo_app;"
  psql -d "$db" -c "GRANT USAGE ON SCHEMA public TO mnemo_app;"
done
```

See `docs/architecture/milestone-1-foundations.md` for why a dedicated, non-superuser
role is required (Postgres Row-Level Security is silently bypassed by superusers).

### Backend (`apps/api`)

With [`uv`](https://docs.astral.sh/uv/):

```bash
cd apps/api
cp .env.example .env
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.main:app --reload
```

Without `uv` -- plain `pip`/`venv` works too, using the pinned `requirements.txt`
(exported from `uv.lock`, so it always matches what `uv` installs; more portable than
`pip install -e .` since it doesn't need editable-install/build-isolation support,
which some locked-down corporate `pip` configs disable):

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

Maintainers: regenerate `requirements.txt` whenever `pyproject.toml`'s dependencies
change, with `uv export --format requirements.txt --no-dev --no-hashes --no-emit-project -o requirements.txt`.

The first install pulls in `sentence-transformers` (and `torch`) for local embeddings --
a larger, slower install than the rest of the stack, and the first server start
downloads the `all-MiniLM-L6-v2` model (~90MB) to the local Hugging Face cache. Both are
one-time costs; expect the very first `uvicorn` start to take longer while it warms the
model (see `docs/architecture/milestone-1-foundations.md`). If your network sits behind
a TLS-intercepting corporate proxy and this download fails with an SSL error, see
`HF_SSL_VERIFY` in `apps/api/.env.example`.

If you have existing items from before milestone 4 (or ever change the embedding
model), backfill their embeddings with a database-owner connection, the same way
migrations run:

```bash
DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" uv run python -m app.backfill_embeddings
# without uv: DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" python -m app.backfill_embeddings
```

Run tests: `DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" uv run pytest`
(or, without `uv`, activate the venv above and run
`DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" pytest`).

Grounded Q&A (`/ask` and conversations) needs an OpenRouter API key and model to work:
set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (and optionally `OPENROUTER_FALLBACK_MODELS`)
in `.env` -- get a key at https://openrouter.ai/keys and pick current model slugs from
https://openrouter.ai/models. Without these, `/ask` and conversations return a clear
"not configured" error rather than failing unpredictably; every other feature works
without it.

Memory summaries (created when a conversation is explicitly ended) expire automatically
after `MEMORY_TTL_DAYS` (default 30), but are only *logically* forgotten at that point
(filtered out of reads). To physically delete expired rows, run the cleanup script
periodically with a database-owner connection, the same way as the embeddings backfill:

```bash
DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" uv run python -m app.cleanup_expired_memories
# without uv: DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" python -m app.cleanup_expired_memories
```

### Frontend (`apps/web`)

```bash
cd apps/web
cp .env.local.example .env.local
npm install
npm run dev
```

Run tests: `npm test` (Vitest/RTL) and `npm run test:e2e` (Playwright, starts both
servers automatically).

Mock login: pick any of the seeded accounts (`alice@mnemo.dev`, `bob@mnemo.dev`,
`carol@mnemo.dev`) at `/login` -- no password, per the MVP's mock-auth scope.
