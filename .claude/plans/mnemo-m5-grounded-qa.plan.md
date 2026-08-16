# Plan: Mnemo — Milestone 5: Grounded Q&A

**Source PRD**: `.claude/prds/mnemo.prd.md`
**Selected Milestone**: 5 — Grounded Q&A
**Complexity**: Medium-Large

## Context
Milestone 4 made items retrievable by meaning; nothing yet turns that into an answer. Milestone 5 closes the retrieve → ask loop from the PRD's core experience: a user asks a natural-language question about a space, Mnemo retrieves the relevant items (reusing milestone 4's embedding search) and asks an LLM to answer *only* from that retrieved context, returning the answer plus the source items it was grounded in. This is the project's first paid external API call — everything before this (auth, embeddings) was deliberately local/free.

**Confirmed decisions** (from this session's discussion, not open for re-litigation in this plan):
- LLM access: **OpenRouter** as a provider-agnostic gateway, not a direct Anthropic/OpenAI SDK integration — keeps the RAG layer decoupled from any single vendor and gets automatic fallback to alternate models if the primary is rate-limited or down. Confirmed via OpenRouter's docs: `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, body `{"model": "<primary>", "models": ["<fallback1>", ...], "messages": [...]}` — OpenAI-Chat-API-compatible, so the official `openai` Python SDK works against it via `base_url` override.
- Retrieval reused, not reinvented: the embedding-based ranking built in milestone 4 (`app/api/v1/search.py`) is extracted into a shared `app/core/retrieval.py` function used by both `/search` and the new `/ask` endpoint.
- Non-streaming: the full answer is returned in one response, matching every other endpoint in this app. No SSE/chunked-response handling.
- Single-turn for this milestone: no conversation history is persisted (that's milestone 6, "Conversation & persistent memory") — `/ask` is stateless, one question in, one grounded answer out.

**Open item carried into implementation** (cannot be resolved in planning): the exact OpenRouter model slugs to default to. OpenRouter's catalog and slug naming change over time and I can't verify current values without guessing — `OPENROUTER_MODEL`/`OPENROUTER_FALLBACK_MODELS` will ship with **no hardcoded default**, failing fast with a clear config error if unset, rather than silently shipping a guessed slug that might be stale or wrong. You'll need to set these from https://openrouter.ai/models and provide an `OPENROUTER_API_KEY` before `/ask` can work.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Config | `apps/api/app/config.py` | Add `openrouter_api_key`, `openrouter_model`, `openrouter_fallback_models` (list, same JSON-array-in-.env pattern as `cors_allow_origins`). |
| Lazy singleton | `apps/api/app/core/embeddings.py:get_model` | An `lru_cache`d OpenRouter client getter in `app/core/llm.py`, not constructed at import time. |
| Extracted shared logic | `apps/api/app/api/v1/search.py` (current embedding-ranking query) | Pulled into `app/core/retrieval.py:retrieve_items(db, space_id, query, limit)`, reused by both `search.py` (refactored) and the new `qa.py`. |
| Space-scoped query | `apps/api/app/core/query_scoping.py:scoped_select` | Retrieval still filters through `scoped_select(Item, space_id)` — no special case for Q&A. |
| Router structure | `apps/api/app/api/v1/search.py`, `router.py` | New `app/api/v1/qa.py` registered the same way. |
| Domain errors | `apps/api/app/core/errors.py` | New `UpstreamError` (502) for LLM-call failures, alongside existing `NotFoundError`/`ForbiddenError`/`UnauthorizedError`. |
| Mockable external call | N/A (new pattern) | `generate_completion()` in `app/core/llm.py` is the single seam between the app and OpenRouter — every automated test mocks it (via `unittest.mock.patch`) rather than making real, costly, non-deterministic API calls, consistent with this project's fast/free/deterministic test suite so far. |
| Frontend page structure | `apps/web/app/spaces/[spaceId]/search/page.tsx` | `/ask` follows the same input-plus-results-list pattern; sources render like search results. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/pyproject.toml` | UPDATE | Add `openai` (SDK, used against OpenRouter's compatible endpoint) |
| `apps/api/app/config.py` | UPDATE | Add `openrouter_api_key: str`, `openrouter_model: str`, `openrouter_fallback_models: list[str] = []` |
| `apps/api/app/core/llm.py` | CREATE | `get_client()` (lru_cache'd `AsyncOpenAI` pointed at OpenRouter), `async def generate_completion(messages: list[dict]) -> str` |
| `apps/api/app/core/retrieval.py` | CREATE | `async def retrieve_items(db, space_id, query, limit=8) -> list[tuple[Item, float]]` — the embedding-search query extracted from `search.py` |
| `apps/api/app/api/v1/search.py` | UPDATE | Use `retrieve_items` instead of its own inline query |
| `apps/api/app/core/errors.py` | UPDATE | Add `UpstreamError` (502) |
| `apps/api/app/schemas/qa.py` | CREATE | `AskRequest {question}`, `AskResponse {answer, sources: list[SearchResult]}` |
| `apps/api/app/api/v1/qa.py` | CREATE | `POST /spaces/{space_id}/ask` |
| `apps/api/app/api/v1/router.py` | UPDATE | Register `qa.router` |
| `apps/api/.env.example` | UPDATE | Add `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODELS` placeholders with a comment pointing to openrouter.ai/models |
| `apps/api/tests/test_qa.py` | CREATE | Mocks `generate_completion`; asserts retrieval scoping, prompt construction, empty-space short-circuit, source shaping |
| `apps/api/tests/test_isolation.py` | UPDATE | Cross-space `/ask` case (404 for non-members, mocked LLM never called) |
| `apps/web/lib/types.ts` | UPDATE | Add `AskResponse` |
| `apps/web/app/spaces/[spaceId]/ask/page.tsx` | CREATE | Question input, answer display, sources list linking to items |
| `apps/web/app/spaces/[spaceId]/page.tsx` | UPDATE | Add an "Ask" link next to Search/View graph |
| `docs/architecture/milestone-1-foundations.md` | UPDATE | Addendum: OpenRouter integration, the mockable-external-call testing pattern, the fail-fast-on-missing-model-config choice |
| `.claude/prds/mnemo.prd.md` | UPDATE | Mark Milestone 5 row, Plan cell → this file |

## Tasks

### Task 1: Retrieval extraction + LLM client
- **Action**: Move `search.py`'s embedding/cosine-distance query into `app/core/retrieval.py:retrieve_items`, returning `list[tuple[Item, float]]` (item + similarity score); update `search.py` to call it and keep its existing behavior/tests passing unchanged. `app/core/llm.py`: `get_client()` returns an `openai.AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=settings.openrouter_api_key)`; `generate_completion(messages)` calls `client.chat.completions.create(model=settings.openrouter_model, messages=messages, extra_body={"models": settings.openrouter_fallback_models} if settings.openrouter_fallback_models else {})` and returns `response.choices[0].message.content`; wraps SDK exceptions into `UpstreamError`.
- **Validate**: `pytest apps/api/tests/test_search.py` still green after the refactor (proves no behavior change).

### Task 2: Ask endpoint
- **Action**: `AskRequest {question: str}`, `AskResponse {answer: str, sources: list[SearchResult]}`. `POST /spaces/{space_id}/ask`: depends on `get_current_space`; `retrieve_items(db, space_id, question, limit=8)`; if empty, return `AskResponse(answer="I don't have any relevant information in this space yet.", sources=[])` **without calling the LLM** (saves a call, avoids the model inventing an answer with zero grounding); else build messages: a system message instructing "answer only using the numbered context below; cite sources inline as [n]; if the context doesn't answer the question, say so explicitly" + a user message containing the numbered context blocks (title + body per item) and the question; call `generate_completion`; return the answer with `sources` = the retrieved items or SearchResult shape (item + score).
- **Validate**: manual httpx call (requires a real `OPENROUTER_API_KEY` in `.env` — see Task 6) against a space with a couple of items; confirm the answer references their content and `sources` lists them.

### Task 3: Error handling
- **Action**: `UpstreamError(DomainError)` with `status_code = 502`, `code = "upstream_error"` in `errors.py`. In `llm.py`, catch `openai.APIError`/`openai.APIConnectionError` etc. and re-raise as `UpstreamError("The AI service is temporarily unavailable. Please try again.")` — no raw provider error details leak to the client.
- **Validate**: unit test mocking `get_client()` to raise, asserting the endpoint returns 502 with the clean message.

### Task 4: Backend tests
- **Action**: `test_qa.py` — mock `app.api.v1.qa.generate_completion` throughout (never a real network call): a question against a space with relevant items returns the mocked answer text and correctly-shaped `sources` drawn from `retrieve_items`; a question against an empty space returns the canned response and asserts the mock was **not** called; an upstream failure (mock raises `UpstreamError`) surfaces as a 502. Extend `test_isolation.py`: non-member `POST /spaces/{space1}/ask` is 404, and the mocked LLM is asserted never called for that case.
- **Validate**: `pytest apps/api/tests -v` green, with zero real network calls (confirm by running with network disabled/airplane mode if convenient, or just by code review that every test mocks `generate_completion`).

### Task 5: Frontend
- **Action**: `AskResponse` type in `lib/types.ts`. `app/spaces/[spaceId]/ask/page.tsx`: question input + submit, displays the answer text, then a "Sources" list (title/kind/snippet, linking to the item) reusing the search page's result-rendering shape. Add an "Ask" link next to "Search"/"View graph" on the space page.
- **Validate**: `npm run build` clean. Live manual check needs a real `OPENROUTER_API_KEY` (Task 6) — without one, verify the empty-space "no relevant information" path and error states render correctly, and note explicitly to the user that the live LLM path itself needs their key to test.

### Task 6: Config, docs, PRD
- **Action**: `.env.example` gets `OPENROUTER_API_KEY=`, `OPENROUTER_MODEL=` (comment: select a current model slug from OpenRouter's catalog at https://openrouter.ai/models — no example value here, since specific slugs can go stale), `OPENROUTER_FALLBACK_MODELS=[]`. Addendum in the architecture doc covering the OpenRouter integration, the mock-the-external-call testing pattern, and why no default model slug is guessed. Update the PRD row.
- **Validate**: doc + PRD updated; `.env.example` documents the required setup clearly enough that a fresh clone knows exactly what to fill in before `/ask` works.

## Validation
```bash
# Backend (no real API key needed -- all tests mock the LLM call)
cd apps/api && DATABASE_URL="postgresql+asyncpg://mnemo_app@localhost/mnemo_test" uv run pytest -v

# Frontend
cd apps/web && npm run build && npm test

# Manual, requires OPENROUTER_API_KEY set in apps/api/.env:
# ask a question in a space with a few items, confirm the answer is grounded
# and the sources list matches what was actually retrieved
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Guessed OpenRouter model slug is stale/wrong | Medium | No hardcoded default (Task 6) — fails fast with a clear config error instead of a confusing runtime API error |
| Automated tests accidentally making real (costly, slow, flaky) API calls | Medium | Every test mocks `generate_completion` at the import site (Task 4); code review confirms no test path reaches `llm.py`'s real client |
| Live end-to-end verification requires a real API key I may not have in this environment | Medium | Backend/frontend correctness verified via mocked tests + code review; live path explicitly flagged as needing the user's own key rather than falsely claimed as tested |
| LLM ignoring "answer only from context" instructions and hallucinating beyond the retrieved items | Low-Medium (inherent to LLM grounding, not fully solvable at MVP) | Explicit system-prompt instruction + empty-context short-circuit; deeper grounding evaluation is out of scope for this milestone |

## Acceptance
- [ ] All 6 tasks complete
- [ ] `pytest apps/api/tests` green, zero real network calls in the suite
- [ ] `npm run build` and `npm test` green
- [ ] `.env.example` clearly documents required OpenRouter setup
- [ ] Live manual verification performed if an API key is available; otherwise explicitly flagged as not-yet-verified live, to the user
- [ ] PRD Milestone 5 row updated
