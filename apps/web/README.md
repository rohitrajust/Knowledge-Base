# Mnemo Web

Next.js (App Router) frontend for Mnemo. See the root `README.md` for full-stack
local setup and `docs/architecture/` for design-system and route conventions.

## Setup

```bash
cd apps/web
cp .env.local.example .env.local
npm install
npm run dev
```

Runs at `http://localhost:3000`. Requires the API (`apps/api`) running at the URL
in `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).

Mock login: pick any of the seeded accounts (`alice@mnemo.dev`, `bob@mnemo.dev`,
`carol@mnemo.dev`) at `/login` -- no password, per the MVP's mock-auth scope.

## Testing

```bash
npm test          # Vitest + React Testing Library
npm run test:e2e  # Playwright -- starts both the web and API servers automatically
npm run lint
```

Vitest queries assertions by role/label/text (e.g. `getByRole("button", { name: "Add" })`),
not by CSS class, so components should keep real semantic elements under any
styling wrapper.

## Route map

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

`app/spaces/[spaceId]/layout.tsx` mounts the persistent `Sidebar` nav for every
space-scoped route above; the plain `/spaces` list page keeps `TopBar` only. Every
space-scoped route is wrapped in `RequireAuth` (`components/RequireAuth.tsx`),
which redirects to `/login` if `useAuth()` (`lib/auth-context.tsx`) has no user
once its initial `/api/v1/auth/me` check resolves.

## Data fetching

All API calls go through `lib/api-client.ts`'s `api.get/post/patch/delete` helpers,
which call the API with `credentials: "include"` (session cookie auth, no bearer
tokens) and throw a typed `ApiError` (`status`, `code`, `message`) on any non-2xx
response, parsed from the backend's `{ error: { code, message, request_id } }`
envelope. `lib/types.ts` mirrors the API's Pydantic response schemas by hand --
there is no codegen, so a backend schema change requires a matching manual edit
here (see `docs/architecture/api-reference.md` for the schemas to mirror).

## Component layout

| Path | Contents |
|---|---|
| `components/ui/` | Shared presentational primitives (`Button`, `Card`, `GlassPanel`, `Input`, `Select`, `Badge`, `EmptyState`, `ErrorMessage`, `LoadingState`, `ListRow`, `MotionList`) -- thin styled wrappers over native elements, kept semantic on purpose (see Testing above) |
| `components/layout/` | `TopBar`, `Sidebar` (space-scoped nav shell) |
| `components/graph/` | The knowledge-graph module: `GraphCanvas` (all canvas painting), `GraphToolbar`, `GraphFilterPanel`, `GraphLegend`, `GraphMinimap`, `FocusBreadcrumb`, `NodeTooltip`, `NodeDetailPanel`, plus `useGraphModel` / `graphTheme` / `nodeInfo` |
| `components/` (root) | Domain components: `ItemList`, `ItemCreateForm`, `ItemLinkPicker`, `SuggestedLinks`, `SpaceCreateForm`, `SpaceSwitcher`, `MemberInviteForm`, `GraphView`/`GraphViewInner`, `AmbientBackground`, `RequireAuth` |
| `lib/` | `api-client.ts`, `types.ts`, `auth-context.tsx`, `cn.ts` (clsx + tailwind-merge), `motionTokens.ts`, `relations.ts` (relation labels, colours and dash patterns), `text.ts` |

`GraphView`/`GraphViewInner` is a two-component split (`next/dynamic(..., { ssr: false })`)
because `react-force-graph-2d` touches `window`/canvas at module load time and
isn't SSR-safe -- any future canvas/WebGL component should follow the same split.

For the design-token system (Tailwind v4 `@theme inline`, the glass token
vocabulary and utilities, the `components/ui/` primitive layer, navigation shell,
typed relations, and the knowledge graph's physics / level-of-detail / de-emphasis
rules), see `docs/architecture/frontend-redesign.md`. For a fuller architecture walkthrough,
see `docs/architecture/frontend-overview.md`.
