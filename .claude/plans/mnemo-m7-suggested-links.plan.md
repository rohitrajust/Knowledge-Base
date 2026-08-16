# Plan: Mnemo — Milestone 7: AI-Suggested Graph Links

**Source PRD**: `.claude/prds/mnemo.prd.md`
**Selected Milestone**: 7 — AI-suggested graph links
**Complexity**: Small-Medium

## Context
Milestone 3 built a user-driven graph; the PRD is explicit that the graph stays user-driven — "AI may suggest relevant links between notes for the user to review and approve, but does not auto-generate the graph." Milestone 7 adds exactly that: a way to surface candidate connections an item doesn't have yet, without ever creating a link without the user's explicit approval.

**Confirmed decisions** (this session's discussion, not open for re-litigation in this plan):
- Suggestions come from **pure embedding similarity** (cosine distance over `items.embedding`, already built in milestone 4) — no LLM call. This is a background/browsing-time computation, not direct user-facing generation, and the project's paid LLM calls have so far been reserved for `/ask`/conversations specifically.
- Suggestions are surfaced **per-item, on the item detail page**, extending the existing "Linked items" section rather than a new space-wide review page.
- Suggestions are **stateless and recomputed on demand** — no new table, no dismissal-tracking, no caching. "Approve" calls the *existing* link-creation endpoint from milestone 3 (`POST .../items/{id}/links`); "Dismiss" just removes the suggestion from the current view client-side. This keeps the milestone additive and small: the only genuinely new capability is *finding* candidates, not creating or storing links, which milestone 3 already does correctly (including RLS, dedup, self-link rejection).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Embedding similarity query | `apps/api/app/core/retrieval.py:retrieve_items` | Same `Item.embedding.cosine_distance(...)` + `scoped_select` pattern, but compares an *existing* item's embedding against others instead of embedding a fresh query string. |
| Reused link creation | `apps/api/app/api/v1/links.py:create_link` | "Approve" is just a normal call to this existing endpoint — already handles canonical ordering, dedup, self-link rejection, and RLS. No new write path for links. |
| Extract-on-third-duplication | `apps/api/app/api/v1/items.py` and `links.py` both have their own private `_get_item_or_404` | This milestone adds a *third* call site needing the same lookup — the right moment to extract it into `app/core/item_lookup.py`, reused by all three, rather than a fourth copy-paste. |
| Response shape reuse | `apps/api/app/schemas/search.py:SearchResult` | Suggestions are structurally identical to search results (item + similarity score) — reused directly, no new schema. |
| Frontend component structure | `apps/web/components/ItemLinkPicker.tsx` | `SuggestedLinks.tsx` sits alongside it on the item detail page, same fetch-and-render-list shape, "Approve" posts to the same link-creation call `ItemLinkPicker` already uses. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/app/core/item_lookup.py` | CREATE | `get_item_or_404(db, space_id, item_id) -> Item`, extracted from the duplicated logic in `items.py`/`links.py` |
| `apps/api/app/api/v1/items.py` | UPDATE | Use the shared helper instead of its own private copy (no behavior change) |
| `apps/api/app/api/v1/links.py` | UPDATE | Same |
| `apps/api/app/core/retrieval.py` | UPDATE | Add `suggest_related_items(db, space_id, item, limit=5) -> list[tuple[Item, float]]` |
| `apps/api/app/api/v1/suggestions.py` | CREATE | `GET /spaces/{space_id}/items/{item_id}/suggested-links` |
| `apps/api/app/api/v1/router.py` | UPDATE | Register `suggestions.router` |
| `apps/api/tests/test_suggestions.py` | CREATE | Ranking, excludes self, excludes already-linked items, respects limit |
| `apps/api/tests/test_isolation.py` | UPDATE | Cross-space suggestion isolation |
| `apps/web/components/SuggestedLinks.tsx` | CREATE | Fetches suggestions, "Approve" (calls the existing link-create endpoint) / "Dismiss" (client-side only) |
| `apps/web/app/spaces/[spaceId]/items/[itemId]/page.tsx` | UPDATE | Render `SuggestedLinks` alongside `ItemLinkPicker` |
| `docs/architecture/milestone-1-foundations.md` | UPDATE | Short addendum: suggestions are stateless/recomputed, approval reuses the existing link endpoint |
| `.claude/prds/mnemo.prd.md` | UPDATE | Mark Milestone 7 row |

## Tasks

### Task 1: Extract shared item lookup
- **Action**: Move the identical `_get_item_or_404` body from `items.py` and `links.py` into `app/core/item_lookup.py:get_item_or_404`; update both call sites to import it. Pure refactor, no behavior change.
- **Validate**: `pytest apps/api/tests/test_items.py apps/api/tests/test_links.py` still green.

### Task 2: Suggestion query + endpoint
- **Action**: `retrieval.py:suggest_related_items(db, space_id, item, limit=5)` — queries `scoped_select(Item, space_id).where(Item.id != item.id, Item.embedding.is_not(None))`, ordered by `item.embedding.cosine_distance(...)`, then excludes items already linked to `item` (query `item_links` for rows where this item is `item_a_id` or `item_b_id`, same lookup shape as `links.py:list_links`) before taking the top `limit`. `app/api/v1/suggestions.py`: `GET /spaces/{space_id}/items/{item_id}/suggested-links` depends on `get_current_space`, uses `get_item_or_404` to resolve the item (404 if it doesn't exist in this space), returns `list[SearchResult]`. An item with no embedding (shouldn't normally happen post-milestone-4, but defensively) returns `[]` rather than erroring.
- **Validate**: manual httpx: three items where two are semantically close and one is unrelated; confirm the close pair suggests each other and the unrelated one doesn't rank first; link two items, confirm they no longer appear in each other's suggestions afterward.

### Task 3: Backend tests
- **Action**: `test_suggestions.py` — semantically similar items rank above dissimilar ones (reuse the milestone-4-style distinguishable-content fixtures, e.g. "chocolate cake" vs "budget report"); an item never suggests itself; an already-linked item is excluded from suggestions (create a link, confirm it drops out); `limit` is respected with more candidates than the limit; an empty/single-item space returns `[]`. Extend `test_isolation.py`: a non-member's request for another space's item suggestions 404s.
- **Validate**: `pytest apps/api/tests -v` green.

### Task 4: Frontend
- **Action**: `SuggestedLinks.tsx` fetches `GET .../suggested-links` for the current item, renders each candidate (title, kind, score) with "Approve" (calls `api.post` to the existing `.../links` endpoint, then removes it from the local suggestions list and adds it to `ItemLinkPicker`'s linked list via a shared refresh/callback) and "Dismiss" (removes from the local list only, no request). Rendered on the item detail page below `ItemLinkPicker`.
- **Validate**: `npm run build` clean; manual browser check — open an item with semantically related unlinked items elsewhere in the space, confirm suggestions appear, approve one and confirm it moves into "Linked items", dismiss another and confirm it disappears without creating a link.

### Task 5: Docs + PRD
- **Action**: Addendum noting suggestions are computed live (no cache/table), and that "approve" is not a new write path — it's the same link-creation endpoint milestone 3 already validated (RLS, dedup, self-link rejection all already covered by existing tests, not re-tested here). Update the PRD row.
- **Validate**: doc + PRD updated.

## Validation
```bash
# Backend
cd apps/api && DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" uv run pytest -v

# Frontend
cd apps/web && npm run build && npm test

# Manual: open an item, confirm relevant suggestions appear (not already-linked items,
# not itself), approve one (becomes a real link), dismiss another (no link created)
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| No absolute similarity threshold means low-relevance suggestions in a sparse space (few items total) | Low | Score is shown in the UI so the user can judge; at MVP scale with few items this is a minor annoyance, not a correctness issue, and an arbitrary threshold picked without real usage data would just be a guess |
| Forgetting to exclude already-linked items, so "approve" on an existing link errors | Medium | Task 2's exclusion query + Task 3's explicit test for it; if missed, `create_link`'s existing dedup check (milestone 3) still prevents a duplicate link, just with a worse UX (an error instead of the pair never being suggested) |
| The extracted `get_item_or_404` accidentally changing behavior for `items.py`/`links.py` during the refactor | Low | Task 1 is a pure move with existing test suites re-run immediately after, before any new code is added |

## Acceptance
- [ ] All 5 tasks complete
- [ ] `pytest apps/api/tests` green, including the suggestion isolation case
- [ ] `npm run build` and `npm test` green
- [ ] Manual walkthrough: suggestions appear, approve creates a real link, dismiss doesn't
- [ ] PRD Milestone 7 row updated
