# Mnemo documentation index

| Doc | Covers |
|---|---|
| [`SETUP.md`](SETUP.md) | **Start here.** Full local setup for Windows and macOS: installing PostgreSQL 18, creating the database, and running the backend and frontend |
| [`architecture/milestone-1-foundations.md`](architecture/milestone-1-foundations.md) | Backend conventions established in milestone 1 and extended in every later milestone: `space_id` tenant scoping, dual-layer isolation (app + Postgres RLS), mock auth, embeddings, LLM gateway, memory bounding -- read this first for backend work |
| [`architecture/frontend-redesign.md`](architecture/frontend-redesign.md) | The Tailwind v4 design-token system, `components/ui/` primitive layer, navigation shell, and knowledge-graph rendering (idle motion, hover highlighting) |
| [`architecture/frontend-overview.md`](architecture/frontend-overview.md) | Frontend routing, auth flow, data-fetching convention, component layout, and known MVP simplifications |
| [`architecture/api-reference.md`](architecture/api-reference.md) | Full REST API reference: every endpoint, auth requirement, request/response shape, and error format |
| [`../apps/api/README.md`](../apps/api/README.md) | Backend setup, env vars, admin scripts, testing |
| [`../apps/web/README.md`](../apps/web/README.md) | Frontend setup, route map, testing |

## Where to start

- **New to the project?** [`SETUP.md`](SETUP.md) for local setup (Windows/macOS).
- **Backend work?** `architecture/milestone-1-foundations.md` for the
  conventions every space-scoped table/route follows, then `architecture/api-reference.md`
  for the concrete endpoints.
- **Frontend work?** `architecture/frontend-overview.md` for routing/data-fetching,
  then `architecture/frontend-redesign.md` for the design system.
- **Adding a milestone?** Read the most recent addendum in
  `architecture/milestone-1-foundations.md` first -- new milestones append a
  dated addendum to that doc rather than starting a new one, keeping the
  convention log in one place.
