# Local setup (Windows & macOS)

This is the canonical, start-to-finish guide for getting Mnemo running
locally. It covers Windows and macOS side by side; wherever a command
differs, both versions are shown. It uses plain `pip`/`venv` for the backend
-- no extra tooling to install first.

If you get stuck, check [Troubleshooting](#troubleshooting) at the bottom
before asking for help.

## 1. Prerequisites

You need four things installed: Git, Python 3.12, Node.js, and PostgreSQL 18.

### Windows

- **Git**: [git-scm.com/download/win](https://git-scm.com/download/win)
- **Python 3.12**: [python.org/downloads](https://www.python.org/downloads/) --
  on the first installer screen, check **"Add python.exe to PATH"** before
  clicking Install.
- **Node.js (LTS)**: [nodejs.org](https://nodejs.org/)
- **PostgreSQL 18**: see [Install PostgreSQL 18](#2-install-postgresql-18) below.

Verify everything is on `PATH` by opening a **new** terminal (PowerShell) and
running:

```powershell
git --version
python --version
node --version
psql --version
```

### macOS

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

## 2. Install PostgreSQL 18

Mnemo needs plain, stock PostgreSQL -- no extensions.

### Windows

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
means the app's database role **must** have a password set -- step 3 below
creates it with one for exactly this reason. If you skip that and create a
passwordless role, the backend will fail to connect with
`password authentication failed for user "mnemo_app"`.

### macOS

```bash
brew install postgresql@18
brew services start postgresql@18
```

If `psql`/`createdb` aren't found afterwards, add Postgres to your `PATH`
(Homebrew prints the exact line to add to your shell profile after install;
on Apple Silicon it's typically
`export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"`).

## 3. Create the database and role

Mnemo uses Postgres Row-Level Security (RLS) to isolate data between spaces.
RLS is silently bypassed by superuser connections, so the app must connect
as a dedicated, non-superuser role (`mnemo_app`) -- never as `postgres`. See
[`architecture/milestone-1-foundations.md`](architecture/milestone-1-foundations.md)
for why.

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

## 4. Backend setup (`apps/api`)

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
password from step 3:

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
- If you're on a corporate network with a TLS-intercepting proxy and that
  model download fails with an SSL error, set `HF_SSL_VERIFY=false` in
  `.env` (see the comment above it in `.env.example`).
- Grounded Q&A (`/ask` and conversations) needs an OpenRouter API key: set
  `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `.env` -- get a key at
  <https://openrouter.ai/keys> and pick a current model slug from
  <https://openrouter.ai/models>. Every other feature works without it.

## 5. Frontend setup (`apps/web`)

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

## 6. Verify it works

1. Open `http://localhost:3000` in a browser.
2. On the login page, pick any of the seeded mock accounts --
   `alice@mnemo.dev`, `bob@mnemo.dev`, or `carol@mnemo.dev` -- no password
   needed.
3. You should land on the spaces list. Create a space and an item to confirm
   the backend and database are wired up correctly.

## Troubleshooting

| Problem | Fix |
|---|---|
| `psql`/`createdb`/`python`/`node` not recognized | The relevant install didn't add itself to `PATH`. Open a **new** terminal after installing, or add the install's `bin` folder to `PATH` manually (see step 1/2 above). |
| `password authentication failed for user "mnemo_app"` | Your `DATABASE_URL` in `.env` doesn't match the password you set on the role in step 3. Either update `.env` or re-run `ALTER ROLE mnemo_app WITH PASSWORD 'devpassword';`. |
| `role "mnemo_app" does not exist` | Step 3 wasn't run against the right server/database, or was skipped. Re-run the `CREATE ROLE` command. |
| Port `5432` already in use | Another Postgres instance (or install) is already running on that port. Stop it, or point `DATABASE_URL` at the port your intended instance uses. |
| Port `8000` or `3000` already in use | Something else is using that port. Stop it, or run `uvicorn app.main:app --reload --port 8001` / `npm run dev -- -p 3001` and update `NEXT_PUBLIC_API_URL` accordingly. |
| `pip install -r requirements.txt` fails building `torch` or similar | Make sure you're on 64-bit Python 3.12 and have upgraded pip first: `python -m pip install --upgrade pip`. |
| Hugging Face model download fails with an SSL error | You're likely behind a corporate TLS-intercepting proxy. Set `HF_SSL_VERIFY=false` in `apps/api/.env` (see `.env.example` for the full explanation). |
| `/ask` or conversations return "not configured" | Expected until you set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `apps/api/.env` -- every other feature works without it. |

For anything else, check the per-app READMEs
([`apps/api/README.md`](../apps/api/README.md),
[`apps/web/README.md`](../apps/web/README.md)) and the architecture docs in
[`docs/architecture/`](architecture/).
