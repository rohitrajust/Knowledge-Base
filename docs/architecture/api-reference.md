# API Reference

Generated from `apps/api/app/api/v1/*.py` and their paired `app/schemas/*.py`
files. This is a reference to the actual route/schema code, not a spec written
ahead of it -- when the two diverge, the code wins; regenerate this doc rather
than hand-patch it into agreement.

All routes are mounted under `/api/v1` (`app/api/v1/router.py`) except `/health`
and `/health/db`, which are unauthenticated and unversioned. All endpoints other
than `/auth/*` and `/health*` require a valid session cookie; every
`/spaces/{space_id}/...` endpoint additionally requires the caller to be a member
of that space (see **Auth & isolation** below).

## Error format

Every error response (via `app.core.errors.DomainError` and its subclasses) uses
one envelope:

```json
{ "error": { "code": "not_found", "message": "Space not found.", "request_id": "..." } }
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `domain_error` | Generic validation/business-rule failure (e.g. duplicate link, self-link) |
| 401 | `unauthorized` | Missing/invalid/expired session |
| 403 | `forbidden` | Authenticated, but not permitted (e.g. non-owner attempting an owner-only action) |
| 404 | `not_found` | Resource doesn't exist, or the caller isn't a member of the space (see below) |
| 502 | `upstream_error` | The OpenRouter LLM gateway failed or is unavailable |
| 500 | `internal_error` | Unhandled exception; raw details are logged server-side only |

## Auth & isolation

- `GET /api/v1/auth/me` (via `get_current_user`) resolves the session cookie
  (`mnemo_session` by default) to a user. Every other authenticated endpoint
  depends on this.
- Every `/spaces/{space_id}/...` route depends on `get_current_space`, which
  verifies a `space_memberships` row exists for `(space_id, current_user)` and
  **404s, not 403s, if not** -- this deliberately avoids confirming a space's
  existence to non-members. A client-supplied `space_id` in a request body is
  never trusted; it always comes from the URL path.
- Isolation is enforced twice: this app-layer check, and Postgres Row-Level
  Security (forced, so it applies even to a query that bypasses `get_current_space`
  by mistake). See `docs/architecture/milestone-1-foundations.md` for the RLS
  design and its gotchas.
- `require_space_owner` gates owner-only actions (rename/delete space, invite/remove
  members) on top of `get_current_space`, returning 403 for a non-owner member.

## Auth (`/api/v1/auth`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/auth/login` | none | `{ email, password }` | `UserOut`, sets session cookie |
| POST | `/auth/signup` | none | `{ email, display_name, password (min 8 chars) }` | `201` `UserOut`, sets session cookie |
| POST | `/auth/logout` | none | -- | `{ status: "ok" }`, clears session cookie |
| GET | `/auth/me` | session | -- | `{ user: UserOut, spaces: SpaceOut[] }` |

Login and signup return the identical "Invalid email or password." message
regardless of whether the email is unknown or the password is wrong, to avoid
confirming which half of the pair was incorrect.

## Spaces (`/api/v1/spaces`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/spaces` | session | `{ name }` | `201` `SpaceOut` |
| GET | `/spaces` | session | -- | `SpaceOut[]` (spaces the caller belongs to) |
| GET | `/spaces/{space_id}` | member | -- | `SpaceOut` |
| PATCH | `/spaces/{space_id}` | owner | `{ name }` | `SpaceOut` (slug never changes, even on rename) |
| DELETE | `/spaces/{space_id}` | owner | -- | `204` (cascades to every space-scoped table) |
| GET | `/spaces/{space_id}/members` | member | -- | `MembershipOut[]` |
| POST | `/spaces/{space_id}/members` | owner | `{ email }` | `201` `MembershipOut` -- 404 if no seeded account matches the email |
| DELETE | `/spaces/{space_id}/members/{user_id}` | owner | -- | `204` -- 403 if removing the sole remaining owner |

`SpaceOut`: `{ id, name, slug, created_by, created_at }`.

## Items (`/api/v1/spaces/{space_id}/items`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/items` | member | `ItemCreate` | `201` `ItemOut` |
| GET | `/items` | member | -- | `ItemOut[]`, newest-updated first |
| GET | `/items/{item_id}` | member | -- | `ItemOut` |
| PATCH | `/items/{item_id}` | member | `ItemUpdate` (partial) | `ItemOut` |
| DELETE | `/items/{item_id}` | member | -- | `204` |

`ItemCreate`: `{ kind: "note"|"document"|"reference", title (1-300 chars), body?, url? }`
-- `url` is required when `kind` is `"reference"`. `ItemOut` adds
`{ id, space_id, created_by, created_at, updated_at }`. Creating or updating
`title`/`body` re-embeds the item (`title + "\n\n" + body`) synchronously in the
same request; a `url`-only update on a reference skips re-embedding.

## Links (`/api/v1/spaces/{space_id}/items/{item_id}/links`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/links` | member | `{ other_item_id, relation? }` | `201` `LinkedItemOut` -- 400 on self-link or duplicate, 422 on unknown relation |
| GET | `/links` | member | -- | `LinkedItemOut[]` (both directions from `item_id`) |
| PATCH | `/links/{link_id}` | member | `{ relation }` | `LinkedItemOut` -- 404 if the link is not on this item |
| DELETE | `/links/{link_id}` | member | -- | `204` |

`LinkedItemOut`: `{ link_id, created_at, relation, direction_out, item: ItemOut }`.

The pair is canonically ordered (`item_a_id < item_b_id` by UUID comparison) so a
single `UNIQUE(item_a_id, item_b_id)` constraint rules out duplicates and reverse
links without app-level dedup logic.

### Relations

`relation` is one of `related` (the default), `references`, `depends_on`,
`supersedes`, `part_of`. All but `related` are **directed**: "A supersedes B" says
something different from "B supersedes A".

Direction is stored in a separate `direction` column (`none` / `a_to_b` / `b_to_a`)
rather than by reordering the pair. Expressing "A supersedes B" as `(a=B, b=A)` would
have meant abandoning the canonical ordering, and with it the UNIQUE constraint that
makes reverse-duplicates impossible; keeping the ordering and recording the semantic
direction alongside it preserves both properties at once.

A link is created *from* `item_id`, so that item becomes the source of a directed
relation regardless of which canonical column it lands in.

`direction_out` is resolved relative to the item being viewed -- `out`, `in`, or
`none` -- so a client rendering an item's link list can show "References X" versus
"Referenced by X" without redoing canonical-order arithmetic.

`PATCH` exists because the UNIQUE pair constraint permits only one link per pair, so
retyping cannot be expressed as delete-then-recreate without a window in which the
link does not exist. It recomputes direction from the endpoint the request came
through, which is also how a directed relation gets flipped: re-issue the same PATCH
from the other item.

Both columns carry a server default (`related` / `none`), so a client that omits
`relation` behaves exactly as it did before relations existed.

## Graph (`/api/v1/spaces/{space_id}/graph`)

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/graph` | member | `{ nodes: GraphNode[], edges: GraphEdge[] }` |

`GraphNode`: `{ id, title, kind }`.
`GraphEdge`: `{ id, source, target, relation, directed }` (item IDs).

Edges are emitted in **relation order**, not storage order: `source` is the "from" end
of the relation, so a renderer can draw an arrowhead without knowing anything about
canonical column ordering. For undirected relations `source`/`target` fall back to
canonical order and `directed` is `false`.

Recomputed fresh on every request from `items`/`item_links` -- nothing is cached.

## Search (`/api/v1/spaces/{space_id}/search`)

| Method | Path | Auth | Query | Response |
|---|---|---|---|---|
| GET | `/search` | member | `q` (string, optional) | `SearchResult[]` |

`SearchResult`: `{ item: ItemOut, score: number }`. Empty/whitespace `q` returns
`[]` without a DB query. Backed by `app.core.retrieval.retrieve_items` --
cosine similarity over the local `sentence-transformers` embedding, top 20.

## Grounded Q&A (`/api/v1/spaces/{space_id}/ask`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/ask` | member | `{ question (1-2000 chars) }` | `{ answer, sources: SearchResult[] }` |

One-shot, no conversation history. Retrieves top 8 items by embedding similarity;
if none are found, returns a fixed "no relevant information" answer with
`sources: []` **without calling the LLM** -- the app never lets the model invent
an ungrounded answer. Requires `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` to be set
(see `apps/api/README.md`); otherwise fails with a clear "not configured" error.

## Conversations (`/api/v1/spaces/{space_id}/conversations`)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/conversations` | member | `{ title? (default "New conversation") }` | `201` `ConversationOut` |
| GET | `/conversations` | member | -- | `ConversationOut[]`, newest-updated first |
| GET | `/conversations/{id}` | member | -- | `ConversationDetailOut` (adds `messages: MessageOut[]`) |
| DELETE | `/conversations/{id}` | member | -- | `204` |
| POST | `/conversations/{id}/messages` | member | `{ question (1-2000 chars) }` | `201` `MessageOut` (the assistant's reply) |
| POST | `/conversations/{id}/end` | member | -- | `MemoryOut \| null` |

Posting a message stores the user message, retrieves grounding context (same
retrieval as `/ask`), pulls in any active space-level memory summaries, and feeds
the LLM up to the most recent `MAX_HISTORY_MESSAGES` (20) prior messages as
history -- a fixed ceiling regardless of how long the conversation has grown.
`MessageOut.sources` is a JSONB snapshot (`item_id`, `title`, `kind`, `score`)
taken at answer time, not a live join, so history still renders correctly if a
cited item is later deleted.

Ending a conversation asks the LLM to summarize it into durable facts under a
prompt that explicitly forbids inventing facts not in the transcript and must
respond with the literal sentinel `NONE` when nothing is worth remembering --
`end` returns `null` in that case, or if the conversation has no messages.
Summaries expire `MEMORY_TTL_DAYS` (default 30) after creation.

## Memory (`/api/v1/spaces/{space_id}/memory`)

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/memory` | member | `MemoryOut[]` (only non-expired) |
| DELETE | `/memory/{memory_id}` | member | `204` |

`MemoryOut`: `{ id, space_id, conversation_id, content, created_at, expires_at }`.
Memory is **shared at the space level**, not private per user -- a summary from
one member's conversation is visible to every other member of the same space.

## Suggested links (`/api/v1/spaces/{space_id}/items/{item_id}/suggested-links`)

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/suggested-links` | member | `SearchResult[]` (up to 5) |

Pure embedding cosine-similarity over other items in the space, excluding the item
itself and anything already linked to it. No LLM call, nothing persisted --
recomputed on every request. "Approve" in the UI is not a separate write path; it
calls the same `POST .../items/{item_id}/links` endpoint as a manual link, so a
suggestion becomes a real link only by going through the same validation
(dedup, self-link rejection) as any other link.

## Health

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | none | `{ status: "ok" }` -- liveness only |
| GET | `/health/db` | none | `{ status: "ok" }`, or `503 { status: "unavailable" }` if `SELECT 1` fails |

## Regenerating this document

Re-derive this reference from `apps/api/app/api/v1/*.py` and `app/schemas/*.py`
after any route or schema change, rather than hand-editing it out of sync with
the code -- the `ecc:update-docs` skill is built for exactly this kind of
source-of-truth sync.
