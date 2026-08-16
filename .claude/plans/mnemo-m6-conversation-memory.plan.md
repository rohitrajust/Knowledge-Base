# Plan: Mnemo — Milestone 6: Conversation & Persistent Memory

**Source PRD**: `.claude/prds/mnemo.prd.md`
**Selected Milestone**: 6 — Conversation & persistent memory
**Complexity**: Large

## Context
Milestone 5's `/ask` is stateless: one question in, one grounded answer out, nothing remembered. Milestone 6 closes the PRD's "remember" step and resolves its most explicit open question ("how should persistent memory work... what gets remembered, how is it surfaced, and how is it forgotten?"). Two related but distinct capabilities are needed: **conversation history** (multi-turn threads, so a follow-up question has context) and **persistent memory** (a separate store of facts that outlive any single conversation and get surfaced in *future*, unrelated conversations too).

**Confirmed decisions** (this session's discussion, not open for re-litigation in this plan):
- Build both conversation threads and a cross-conversation memory store, not just history.
- Memory entries are auto-generated: the LLM summarizes a conversation when the user explicitly **ends** it (an explicit "End conversation" action, not generated after every message — keeps LLM calls proportional to real usage, not chat noise).
- Forgetting is **automatic expiry** after a time window (not manual-only) — a real, deliberate choice: memory entries get an `expires_at`, filtered out of every read once passed, plus an admin cleanup script (matching the `backfill_embeddings.py` precedent) for physically deleting expired rows. No reinforcement/decay mechanism — a fixed TTL from creation, kept simple for MVP. Manual deletion is also available (cheap to add, consistent with every other resource in this app having a delete action) alongside automatic expiry.
- The existing stateless `POST /spaces/{id}/ask` (milestone 5) is left as-is, unremoved — conversations are additive. The frontend's Ask page/nav link is replaced by the new conversation-based flow, since that's the more complete experience this milestone calls for.
- **Memory is shared at the space level, not private to the member who triggered it.** `MemorySummary` is `SpaceScopedMixin`-scoped like every other table (by `space_id`, not `created_by`/`user_id`), and both the listing and context-injection queries filter only by `space_id` — a memory summarized from Alice's conversation is surfaced in Bob's later conversation in the *same* space, matching how items/graph/search already work for every team member. RLS still means no cross-*space* leakage (a different space's memory is never visible), but there is no cross-*user* privacy boundary within a space — this is a deliberate choice, consistent with the project's "shared team knowledge base" premise, not an oversight.
- **Conversation history fed into the LLM is bounded**, not unbounded: only the most recent `MAX_HISTORY_MESSAGES` (20) messages from a conversation are included when building context for a new question or an end-of-conversation summary, regardless of how long the conversation has actually grown. This caps token usage/cost per call at a predictable ceiling instead of growing linearly with conversation length. (A future milestone could do smarter truncation — e.g. summarizing older turns instead of dropping them — but a fixed recent-window cap is enough to make token growth bounded and predictable now, which is the actual requirement.)
- **The summarization prompt is explicitly anti-hallucination**: it instructs the model to extract only facts/decisions actually stated in the transcript (never infer or add information), to ignore small talk/clarifying back-and-forth, and to respond with the literal sentinel `NONE` if nothing in the conversation is durable enough to remember — in which case no `MemorySummary` row is created at all. "Ending" a conversation does not guarantee a memory gets created; it guarantees the model is *asked* whether one should exist, and that question is graded on real content, not filled in for the sake of having an answer.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Space-scoped model | `apps/api/app/models/item.py`, `item_link.py` | `Conversation`, `Message`, `MemorySummary` all inherit `SpaceScopedMixin` — every RLS-protected table gets `space_id` directly, even `Message` (scoped through `conversation_id` logically, but denormalized onto the row itself) so RLS policies stay uniform across every table, matching how `item_links` already does this. |
| RLS + `NULLIF` guard | `apps/api/app/db/migrations/versions/0003_create_items.py` | New tables get `ENABLE`/`FORCE ROW LEVEL SECURITY` + 4 per-command policies keyed on `NULLIF(current_setting('app.current_space_id', true), '')::uuid`. |
| Admin script bypassing RLS deliberately | `apps/api/app/backfill_embeddings.py` | `app/cleanup_expired_memories.py` follows the exact same shape and the same documented reasoning (run with a database-owner connection, not `mnemo_app`, since it needs to touch expired rows across every space). |
| Extracted shared logic | `apps/api/app/core/retrieval.py` (extracted from `search.py` in milestone 5) | `SYSTEM_PROMPT` and context-block formatting, currently inline in `app/api/v1/qa.py`, get extracted into `app/core/prompting.py` so both the stateless `/ask` and the new multi-turn conversation endpoint build prompts identically instead of duplicating logic. |
| Mockable external call | `apps/api/app/core/llm.py:generate_completion` | Reused unchanged; conversation endpoints and memory summarization both call it, and every test mocks it — no real LLM calls in the automated suite, same as milestone 5. |
| Router structure | `apps/api/app/api/v1/qa.py`, `router.py` | New `app/api/v1/conversations.py` and `app/api/v1/memory.py`, registered the same way. |
| Frontend page structure | `apps/web/app/spaces/[spaceId]/ask/page.tsx` | Conversation list/thread pages follow the same client-component + fetch + form pattern. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/app/models/conversation.py` | CREATE | `Conversation(Base, SpaceScopedMixin)`: id, space_id, title, created_by, created_at, updated_at, ended_at (nullable) |
| `apps/api/app/models/message.py` | CREATE | `Message(Base, SpaceScopedMixin)`: id, space_id, conversation_id, role (`user`\|`assistant`, CHECK), content, sources (JSONB, nullable — snapshot of cited items at answer time), created_at |
| `apps/api/app/models/memory.py` | CREATE | `MemorySummary(Base, SpaceScopedMixin)`: id, space_id, conversation_id (FK, `ON DELETE SET NULL`), content, created_at, expires_at |
| `apps/api/app/models/__init__.py` | UPDATE | Register the three new models |
| `apps/api/app/db/migrations/versions/0006_create_conversations_messages_memory.py` | CREATE | All three tables, RLS enable/force + 4 policies each (matching `0003`/`0004`'s pattern) |
| `apps/api/app/config.py` | UPDATE | Add `memory_ttl_days: int = 30` |
| `apps/api/app/core/prompting.py` | CREATE | `SYSTEM_PROMPT`, `format_context_block(results)` — extracted from `qa.py` so both endpoints share it |
| `apps/api/app/api/v1/qa.py` | UPDATE | Use the extracted `app/core/prompting.py` helpers instead of its own inline copies (no behavior change) |
| `apps/api/app/schemas/conversation.py` | CREATE | `ConversationCreate`, `ConversationOut`, `ConversationDetailOut` (+messages), `MessageCreate {question}`, `MessageOut` |
| `apps/api/app/schemas/memory.py` | CREATE | `MemoryOut` |
| `apps/api/app/api/v1/conversations.py` | CREATE | Create/list/get/delete conversation, post a message (multi-turn RAG), end conversation (triggers memory summarization) |
| `apps/api/app/api/v1/memory.py` | CREATE | List active (non-expired) memory entries, delete one |
| `apps/api/app/api/v1/router.py` | UPDATE | Register `conversations.router`, `memory.router` |
| `apps/api/app/cleanup_expired_memories.py` | CREATE | Admin script (same pattern/caveats as `backfill_embeddings.py`) to physically delete expired `memory_summaries` rows |
| `apps/api/tests/test_conversations.py` | CREATE | Multi-turn context correctness, end-conversation → memory creation, list/get/delete |
| `apps/api/tests/test_memory.py` | CREATE | Expired entries excluded from listing and from context injection; manual delete; TTL computed correctly |
| `apps/api/tests/test_isolation.py` | UPDATE | Cross-space conversation/message/memory isolation |
| `apps/web/lib/types.ts` | UPDATE | Add `Conversation`, `Message`, `MemorySummary` |
| `apps/web/app/spaces/[spaceId]/conversations/page.tsx` | CREATE | List conversations, create new |
| `apps/web/app/spaces/[spaceId]/conversations/[conversationId]/page.tsx` | CREATE | Thread view: message history, ask a follow-up, sources, "End conversation" |
| `apps/web/app/spaces/[spaceId]/memory/page.tsx` | CREATE | List active memory entries, delete |
| `apps/web/app/spaces/[spaceId]/page.tsx` | UPDATE | Replace "Ask" link with "Conversations"; add "Memory" link |
| `docs/architecture/milestone-1-foundations.md` | UPDATE | Addendum: conversation/message/memory schema shape, the expiry-filter-at-read + admin-cleanup pattern |
| `.claude/prds/mnemo.prd.md` | UPDATE | Mark Milestone 6 row; resolve the persistent-memory open question |

## Tasks

### Task 1: Schema + migration
- **Action**: Three models per the table above. `role` gets a `CHECK (role IN ('user','assistant'))` matching `items.kind`'s convention. `sources` is a nullable JSONB column (`sqlalchemy.dialects.postgresql.JSONB`) storing `[{"item_id": "...", "score": 0.83}, ...]` — a snapshot, not a live FK relationship, since historical citations may reference since-deleted items (expected, not a bug). Migration `0006` creates all three tables with RLS enable/force + 4 policies each, same `NULLIF(...)::uuid` guard as every prior migration.
- **Validate**: `alembic upgrade head` clean on both DBs; `\d+ conversations`, `\d+ messages`, `\d+ memory_summaries` show RLS enabled+forced with all 4 policies.

### Task 2: Prompt extraction + bounding + summarization prompt
- **Action**: Move `qa.py`'s `SYSTEM_PROMPT` and context-formatting into `app/core/prompting.py`; `qa.py` imports from there instead of defining inline (no behavior change). Also add to `app/core/prompting.py`:
  - `MAX_HISTORY_MESSAGES = 20` — a module-level constant. Any code building a multi-turn message list takes only `conversation_messages[-MAX_HISTORY_MESSAGES:]`, so token usage per LLM call is bounded by a fixed ceiling regardless of how long a conversation has actually grown, not by conversation length.
  - `SUMMARY_SYSTEM_PROMPT` — the anti-hallucination guardrail for memory extraction:
    ```
    You are extracting durable, reusable project knowledge from a team conversation
    for shared long-term memory. Summarize ONLY facts, decisions, or conclusions that
    were explicitly stated below -- never infer, guess, or add information that was
    not actually said. Ignore small talk and clarifying back-and-forth that isn't
    durable project knowledge worth remembering weeks from now.
    If nothing in this conversation is worth remembering long-term, respond with
    exactly the single word: NONE. Otherwise, respond with a concise 2-5 sentence
    summary of only the durable facts/decisions.
    ```
    `NO_MEMORY_SENTINEL = "NONE"` alongside it, for the endpoint to check against (case/whitespace-insensitive compare).
- **Validate**: `pytest apps/api/tests/test_qa.py` still green (no behavior change to `/ask`).

### Task 3: Conversation endpoints
- **Action**: `app/api/v1/conversations.py`, all under `/spaces/{space_id}/conversations`:
  - `POST ""` → create an empty conversation (`title` defaults to `"New conversation"`), owner-agnostic (any member).
  - `GET ""` → list, most recently updated first.
  - `GET "/{conversation_id}"` → detail including its messages in order.
  - `DELETE "/{conversation_id}"` → delete (cascades messages via FK).
  - `POST "/{conversation_id}/messages"` → the core multi-turn RAG flow: `retrieve_items` for the *new* question only (not the whole thread, keeping retrieval focused and cheap); fetch active (non-expired), space-shared memory summaries and include them as an extra context block (visible regardless of which member's conversation created them — see the space-level-sharing decision above); build the message list as `[system] + [prior conversation messages, most recent MAX_HISTORY_MESSAGES only, role-mapped] + [new user message with numbered item context + memory block + question]`; call `generate_completion`; persist both the user message and the assistant's message (with `sources`) in one transaction; bump `conversation.updated_at`; return the assistant's `MessageOut`.
  - `POST "/{conversation_id}/end"` → sets `ended_at`; if the conversation has messages, calls the LLM with `SUMMARY_SYSTEM_PROMPT` over the (bounded, most-recent-`MAX_HISTORY_MESSAGES`) transcript; if the response equals `NO_MEMORY_SENTINEL`, creates **no** memory row; otherwise creates a `MemorySummary` row (`expires_at = now() + settings.memory_ttl_days` days) and returns it. Returns `null` either when the conversation had no messages to summarize, or when the model determined nothing in it was durable enough to remember — both are legitimate "no memory" outcomes, not errors.
- **Validate**: manual httpx: create conversation → ask two questions (assert the second call's mocked-messages argument includes the first Q&A pair, and that a synthetic conversation with more than `MAX_HISTORY_MESSAGES` prior messages only includes the most recent window) → end conversation → confirm a memory row exists with the right `expires_at`. Separately: mock the summarizer to return `NONE` and confirm no memory row is created.

### Task 4: Memory endpoints
- **Action**: `app/api/v1/memory.py` under `/spaces/{space_id}/memory`: `GET ""` lists memory entries where `expires_at > now()` (expired ones are never returned, functionally forgotten immediately on expiry regardless of whether cleanup has run); `DELETE "/{memory_id}"` removes one explicitly.
- **Validate**: manual check — create a memory entry with a past `expires_at` directly via SQL, confirm it's excluded from the list and from new conversations' context injection.

### Task 5: Cleanup script
- **Action**: `app/cleanup_expired_memories.py`, structured like `backfill_embeddings.py`: deletes all `memory_summaries` rows where `expires_at < now()`, run with a database-owner connection (documented the same way, same reasoning — it needs to see expired rows across every space, which `mnemo_app`'s RLS scoping correctly won't allow).
- **Validate**: `DATABASE_URL="postgresql+asyncpg://localhost/mnemo_dev" uv run python -m app.cleanup_expired_memories` runs clean against a DB with a manually-expired test row and removes it.

### Task 6: Backend tests
- **Action**: `test_conversations.py` — mocks `generate_completion` throughout (same pattern as `test_qa.py`): multi-turn context is correctly assembled (assert on the mock's call args across two sequential messages); a conversation seeded with more than `MAX_HISTORY_MESSAGES` messages only sends the most recent window to the mock, proving the bound actually applies, not just exists as a constant; ending a conversation with messages creates exactly one memory entry with the right TTL; the summarizer mock returning `NONE` creates zero memory entries (proves the anti-hallucination sentinel is honored, not just documented); ending an empty conversation creates none and doesn't call the LLM; delete cascades messages. `test_memory.py` — expired entries excluded from `GET /memory` and from a new conversation's context (assert the mocked LLM call's messages don't contain expired-memory content); a memory summary created from one member's (e.g. Alice's) conversation is asserted visible to a different member (e.g. Bob) of the same space, both via `GET /memory` and via being included in Bob's own new conversation's context — proving space-level sharing is real behavior, not just a stated intent; manual delete works. Extend `test_isolation.py`: non-member access to another space's conversations/messages/memory is 404, mocked LLM never called.
- **Validate**: `pytest apps/api/tests -v` green, zero real network calls (same mocking discipline as `test_qa.py`).

### Task 7: Frontend
- **Action**: Types in `lib/types.ts`. `/spaces/[spaceId]/conversations` (list + create, same list-plus-create-form pattern as the items list). `/spaces/[spaceId]/conversations/[conversationId]` (message thread: render messages in order with role-based styling, an input for the next question, sources shown under assistant messages like the `/ask` page already does, an "End conversation" button that navigates back to the list on success). `/spaces/[spaceId]/memory` (list with delete buttons, same shape as the members list). Space page: swap "Ask" for "Conversations", add "Memory".
- **Validate**: `npm run build` clean. Manual browser check of everything that doesn't need a real OpenRouter key (conversation creation/listing, empty-conversation end, memory list/delete UI); the actual multi-turn answer generation and summarization need a real key to verify live, same caveat as milestone 5.

### Task 8: Docs + PRD
- **Action**: Addendum in the architecture doc covering the new schema, the `sources` JSONB snapshot choice, and the expiry-filter-at-read + admin-cleanup-script pattern for "forgetting." Update the PRD: mark Milestone 6, resolve the persistent-memory open question with what was actually built.
- **Validate**: doc + PRD updated.

## Validation
```bash
# Backend (no real API key needed -- all tests mock the LLM call)
cd apps/api && uv run alembic upgrade head \
  && DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" uv run pytest -v

# Frontend
cd apps/web && npm run build && npm test

# Manual, requires OPENROUTER_API_KEY set in apps/api/.env:
# start a conversation, ask a follow-up that depends on the first answer's context,
# end the conversation, confirm a memory entry appears, start a NEW conversation and
# confirm that memory is surfaced in its context
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| A fixed 20-message window still being large enough to be costly for very long conversations, or too small to preserve meaningful context for genuinely long-running threads | Low | A flat recency window is a deliberate, simple starting bound (resolves "unbounded," which was the actual requirement); tuning the exact number or moving to smarter truncation (e.g. summarizing dropped turns) is a reasonable future refinement, not a gap in this milestone |
| The model ignoring the `NONE` sentinel instruction and summarizing trivial/empty conversations anyway | Low-Medium (inherent LLM instruction-following risk) | Explicit, direct instruction in `SUMMARY_SYSTEM_PROMPT`; `test_conversations.py` verifies the app *honors* `NONE` correctly when the model returns it, which is the part actually under this codebase's control — whether the model reliably chooses to return it is a prompt-quality question outside automated-test coverage |
| `messages.sources` JSONB referencing a since-deleted item silently breaking frontend rendering | Low | Frontend renders whatever the snapshot contains without an FK-backed fetch; a deleted item's title/kind are still in the snapshot, so display degrades gracefully (just an unclickable/stale link at worst) |
| Automatic-expiry design meaning a memory entry can vanish mid-session in a way that surprises a user | Low | Explicit choice per this session's discussion; TTL default (30 days) is long enough that this is a non-issue at MVP usage patterns |
| Forgetting to filter expired memories in *both* the list endpoint and the context-injection path (two separate query sites) | Medium | Task 4 and Task 3's message-posting flow both filter explicitly; `test_memory.py` asserts both paths, not just the list endpoint |
| Space-level memory sharing being mistaken for a privacy bug rather than intended behavior | Low | Explicitly stated as a confirmed decision in this plan and directly tested in Task 6, not left implicit |

## Acceptance
- [ ] All 8 tasks complete
- [ ] `pytest apps/api/tests` green, including conversation/memory isolation cases, the history-window-bounding assertion, the `NONE`-sentinel assertion, and the cross-member-same-space memory-sharing assertion, zero real network calls
- [ ] `npm run build` and `npm test` green
- [ ] Manual walkthrough of non-LLM paths (create/list/delete conversations and memory entries)
- [ ] Live multi-turn + memory-surfacing walkthrough performed if an API key is available; otherwise explicitly flagged as not-yet-verified live
- [ ] PRD Milestone 6 row updated; persistent-memory open question resolved with the space-sharing, bounding, and anti-hallucination decisions documented
