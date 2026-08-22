"""Grounded Q&A over a space's items.

`POST .../ask` is the original buffered endpoint; `POST .../ask/stream` emits the same
answer as an NDJSON event stream (`sources` -> `delta`* -> `done`) so the client can
render tokens as they arrive and show sources the moment retrieval finishes. The two
calls build identical prompts from identical retrieval, so answers don't differ -- only
the transport does.
"""

import json
import time

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space
from app.core.errors import DomainError
from app.core.llm import generate_completion, generate_completion_stream
from app.core.logging import get_logger
from app.core.prompting import SYSTEM_PROMPT, format_context_block
from app.core.retrieval import retrieve_items
from app.db.session import get_db
from app.models.item import Item
from app.schemas.qa import AskRequest, AskResponse
from app.schemas.search import SearchResult

router = APIRouter(prefix="/spaces/{space_id}/ask", tags=["qa"])

NO_CONTEXT_ANSWER = "I don't have any relevant information in this space yet."

logger = get_logger(__name__)


def _build_messages(results: list[tuple[Item, float]], question: str) -> list[dict[str, str]]:
    context = format_context_block(results)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
    ]


def _ndjson(event: dict) -> str:
    return json.dumps(event, separators=(",", ":")) + "\n"


@router.post("", response_model=AskResponse)
async def ask(
    payload: AskRequest,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> AskResponse:
    started = time.perf_counter()
    results = await retrieve_items(db, current.space.id, payload.question, limit=8)
    logger.info("ask_retrieve_finished", retrieve_ms=round((time.perf_counter() - started) * 1000, 2))
    if not results:
        # No embedded items in the space to ground an answer in -- skip the LLM call
        # entirely rather than let it invent an answer with zero grounding.
        return AskResponse(answer=NO_CONTEXT_ANSWER, sources=[])

    messages = _build_messages(results, payload.question)
    answer = await generate_completion(messages)

    sources = [SearchResult(item=item, score=score) for item, score in results]
    return AskResponse(answer=answer, sources=sources)


@router.post("/stream")
async def ask_stream(
    payload: AskRequest,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    started = time.perf_counter()
    results = await retrieve_items(db, current.space.id, payload.question, limit=8)
    logger.info("ask_retrieve_finished", retrieve_ms=round((time.perf_counter() - started) * 1000, 2))
    sources_payload = [SearchResult(item=item, score=score).model_dump(mode="json") for item, score in results]
    messages = _build_messages(results, payload.question) if results else None

    async def event_stream():
        yield _ndjson({"type": "sources", "sources": sources_payload})
        if messages is None:
            yield _ndjson({"type": "delta", "text": NO_CONTEXT_ANSWER})
            yield _ndjson({"type": "done"})
            return
        try:
            async for piece in generate_completion_stream(messages):
                yield _ndjson({"type": "delta", "text": piece})
        except DomainError as exc:
            yield _ndjson({"type": "error", "error": {"code": exc.code, "message": exc.message}})
            return
        yield _ndjson({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        # Best-effort hints that intermediate proxies should not buffer the stream;
        # harmless where they are unknown.
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
