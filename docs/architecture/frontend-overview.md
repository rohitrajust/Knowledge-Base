# Frontend architecture overview

This documents `apps/web`'s structure -- routing, auth, and the data-fetching
convention -- as it stands across milestones 1-7. For the design-token/component-
layer redesign (Tailwind v4 theme, `components/ui/` primitives, navigation shell,
knowledge-graph rendering), see `docs/architecture/frontend-redesign.md`; this
doc doesn't repeat that content.

## Routing

Next.js App Router, all routes under `apps/web/app/`:

```
/login                                              -- mock sign-in
/spaces                                             -- list/create spaces
/spaces/[spaceId]                                   -- space overview
/spaces/[spaceId]/items/[itemId]                    -- item detail
/spaces/[spaceId]/search                            -- semantic search
/spaces/[spaceId]/graph                             -- knowledge graph
/spaces/[spaceId]/ask                                -- one-shot Q&A
/spaces/[spaceId]/conversations                     -- conversation list
/spaces/[spaceId]/conversations/[conversationId]    -- multi-turn Q&A
/spaces/[spaceId]/memory                            -- memory summaries
```

Two layouts: `app/spaces/layout.tsx` (bare `TopBar`, wraps the `/spaces` list
page) and `app/spaces/[spaceId]/layout.tsx` (adds the persistent `Sidebar` nav for
every space-scoped route). This split exists because `/spaces` itself has no
single space to scope a sidebar to.

## Auth flow

`lib/auth-context.tsx`'s `AuthProvider` calls `GET /api/v1/auth/me` once on mount
and holds `{ user, loading }` in React context via `useAuth()`. There's no
client-side token; the session lives in an httpOnly cookie the browser sends
automatically (`credentials: "include"` on every `fetch`, set in
`lib/api-client.ts`).

`components/RequireAuth.tsx` wraps every space-scoped page: while `loading` it
renders a loading state; once resolved, if `user` is null it `router.replace("/login")`.
Because the check is client-side (an effect, not middleware), a logged-out user
briefly sees the loading state before the redirect fires rather than being
blocked at the routing layer -- acceptable for the MVP's mock-auth scope, called
out here as a known simplification rather than an oversight.

## Data fetching

There is no server-side data fetching layer (no Route Handlers proxying the API,
no `getServerSideProps`-equivalent) -- every page is a Client Component that calls
the FastAPI backend directly from the browser via `lib/api-client.ts`:

```ts
export const api = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", ... }),
  patch:  <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", ... }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
```

Every call sets `credentials: "include"` and throws a typed `ApiError` (`status`,
`code`, `message`) on any non-2xx response, parsed from the backend's
`{ error: { code, message, request_id } }` envelope (`app.core.errors` on the
API side). Pages catch `ApiError` to drive their error-state UI; `code` lets a
page distinguish, e.g., a 404 from a 400 without string-matching `message`.

`lib/types.ts` hand-mirrors the API's Pydantic response schemas -- there is no
codegen or shared schema package between the two apps. A backend schema change
(new field, renamed field, new endpoint) requires a matching manual edit to
`lib/types.ts`; see `docs/architecture/api-reference.md` for the schemas to keep
in sync.

## Component layout

| Path | Contents |
|---|---|
| `components/ui/` | Presentational primitives (`Button`, `Card`, `Input`, `Textarea`, `Select`, `Badge`, `EmptyState`, `ErrorMessage`, `LoadingState`, `ListRow`, `MotionList`) |
| `components/layout/` | `TopBar`, `Sidebar` |
| `components/` (root) | Domain components: `ItemList`, `ItemCreateForm`, `ItemLinkPicker`, `SuggestedLinks`, `SpaceCreateForm`, `SpaceSwitcher`, `MemberInviteForm`, `GraphView`/`GraphViewInner`, `RequireAuth`, `MnemoLogo`, `UstMark` |

Pages under `app/` compose these components and own their own data-fetching
(`useEffect` + `api.get`), loading/empty/error conditionals, and mutation calls
directly -- there's no shared data-fetching hook or client-side cache (no
React Query/SWR); each page manages its own `useState` for fetched data.

## Testing

Vitest + React Testing Library (`npm test`) query by role/label/text, which is
why every `components/ui/` primitive renders a real underlying semantic element
(`Button` a real `<button>`, `Select` a real `<select>`) rather than a `div`-based
custom control. Playwright (`npm run test:e2e`) drives both servers together and
covers full user flows across pages; `tests/e2e/smoke.spec.ts` is the standing
smoke suite.

## Known simplifications (MVP scope)

- No SSR/server-fetched initial data -- every page fetches client-side after mount.
- No shared client-side cache -- navigating between pages re-fetches.
- No codegen between backend schemas and `lib/types.ts` -- kept in sync by hand.
- Auth gating is client-side only (see **Auth flow** above), not enforced at the
  routing/middleware layer.

These are documented here as explicit MVP boundaries, not silently-accumulated
debt -- see `.claude/prds/mnemo.prd.md` for the project's overall scope.
