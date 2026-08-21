# Mnemo

AI-native knowledge base for software engineering teams: shared spaces, semantic
search, grounded Q&A, and an interactive knowledge graph.

## Documentation

See `docs/README.md` for the full documentation index -- architecture docs
(backend conventions, frontend structure, API reference), and pointers to the
per-app READMEs (`apps/api/README.md`, `apps/web/README.md`).

## Local development

Requires PostgreSQL 18 (plain, stock -- no extensions needed) running locally.

**For full step-by-step setup instructions (Windows and macOS, including
installing PostgreSQL 18 and creating the database), see
[`docs/SETUP.md`](docs/SETUP.md).** Quick reference once everything is
installed:

```bash
# Backend
cd apps/api
cp .env.example .env   # then set DATABASE_URL to your mnemo_app role + password
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload

# Frontend (second terminal)
cd apps/web
cp .env.local.example .env.local
npm install
npm run dev
```

Mock login: pick any of the seeded accounts (`alice@mnemo.dev`, `bob@mnemo.dev`,
`carol@mnemo.dev`) at `/login` -- no password, per the MVP's mock-auth scope.

Admin scripts (embedding backfill, expired-memory cleanup) and test commands are
documented in [`apps/api/README.md`](apps/api/README.md).
