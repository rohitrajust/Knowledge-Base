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

Requires PostgreSQL (with the `pgvector` extension available) running locally.

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

```bash
cd apps/api
cp .env.example .env
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.main:app --reload
```

The first `uv sync`/`uv run` pulls in `sentence-transformers` (and `torch`) for local
embeddings -- a larger, slower install than the rest of the stack, and the first server
start downloads the `all-MiniLM-L6-v2` model (~90MB) to the local Hugging Face cache.
Both are one-time costs; expect the very first `uvicorn` start to take longer while it
warms the model (see `docs/architecture/milestone-1-foundations.md`).

If you have existing items from before milestone 4 (or ever change the embedding
model), backfill their embeddings with a database-owner connection, the same way
migrations run:

```bash
DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" uv run python -m app.backfill_embeddings
```

Run tests: `DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" uv run pytest`

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
