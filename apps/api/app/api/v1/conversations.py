"""Multi-turn conversations: CRUD plus the grounded chat turn itself.

The chat turn exists in two transports that build identical prompts from identical
retrieval -- only delivery differs:

- `POST .../messages` buffers the full answer and returns it as one MessageOut.
- `POST .../messages/stream` emits an NDJSON event stream (`sources` -> `delta`* ->
  `done`) so clients render tokens as they arrive and show sources the moment
  retrieval finishes.

Both paths persist the user turn durably BEFORE the LLM call (so an upstream failure
can never lose what the user asked) and keep every DB transaction short -- generation
runs outside any transaction instead of pinning row locks for the whole call.
`POST .../end` marks the conversation ended and returns immediately; the memory
summary is produced by a background task so clicking End never waits on an LLM.
"""

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space, get_current_user
from app.config import get_settings
from app.core.active_memory import get_active_memories
from app.core.context import request_id_var
from app.core.errors import DomainError, NotFoundError
from app.core.llm import generate_completion, generate_completion_stream
from app.core.logging import get_logger
from app.core.prompting import (
    MAX_HISTORY_MESSAGES,
    NO_MEMORY_SENTINEL,
    SUMMARY_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    format_context_block,
)
from app.core.query_scoping import activate_rls_for_space, scoped_select
from app.core.retrieval import embed_query, rank_items
from app.db.session import async_session_factory, get_db
from app.models.conversation import Conversation
from app.models.memory import MemorySummary
from app.models.message import Message
from app.models.user import User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationDetailOut,
    ConversationEndedOut,
    ConversationOut,
    MessageCreate,
    MessageOut,
)

router = APIRouter(prefix="/spaces/{space_id}/conversations", tags=["conversations"])

logger = get_logger(__name__)


async def _get_conversation_or_404(
    db: AsyncSession, space_id: uuid.UUID, conversation_id: uuid.UUID
) -> Conversation:
    result = await db.execute(scoped_select(Conversation, space_id).where(Conversation.id == conversation_id))
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise NotFoundError("Conversation not found.")
    return conversation


def _reject_if_ended(conversation: Conversation) -> None:
    """An ended conversation is a locked transcript: the UI hides the composer, and
    the API must agree, or ended_at would be cosmetic. Applies to both chat-turn
    transports so neither can append to a locked thread."""
    if conversation.ended_at is not None:
        raise DomainError("This conversation has ended.")


async def _get_messages(db: AsyncSession, space_id: uuid.UUID, conversation_id: uuid.UUID) -> list[Message]:
    result = await db.execute(
        scoped_select(Message, space_id)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(
    payload: ConversationCreate,
    user: User = Depends(get_current_user),
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> Conversation:
    conversation = Conversation(space_id=current.space.id, title=payload.title, created_by=user.id)
    db.add(conversation)
    await db.flush()
    return conversation


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> list[Conversation]:
    result = await db.execute(
        scoped_select(Conversation, current.space.id).order_by(Conversation.updated_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> ConversationDetailOut:
    conversation = await _get_conversation_or_404(db, current.space.id, conversation_id)
    messages = await _get_messages(db, current.space.id, conversation_id)
    return ConversationDetailOut(
        id=conversation.id,
        space_id=conversation.space_id,
        title=conversation.title,
        created_by=conversation.created_by,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        ended_at=conversation.ended_at,
        messages=[MessageOut.model_validate(m) for m in messages],
    )


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> None:
    conversation = await _get_conversation_or_404(db, current.space.id, conversation_id)
    await db.delete(conversation)


async def _prepare_turn(
    db: AsyncSession, space_id: uuid.UUID, conversation_id: uuid.UUID, question: str
) -> tuple[list[Message], list[tuple[object, float]], list]:
    """Everything before the LLM call, shared by both chat-turn transports: bounded
    history, retrieval, and active memories. The CPU-bound query embedding runs as a
    task concurrent with the DB queries rather than strictly before them -- it touches
    no DB state, so this is pure latency win (~tens of ms per turn).
    """
    started = time.perf_counter()
    embed_task = asyncio.create_task(embed_query(question))

    # Bounded to the most recent MAX_HISTORY_MESSAGES so token usage per call has a
    # fixed ceiling regardless of how long the conversation has actually grown. Fetched
    # before the new user message is inserted, so history excludes the question itself.
    prior_messages = (await _get_messages(db, space_id, conversation_id))[-MAX_HISTORY_MESSAGES:]
    history_ms = round((time.perf_counter() - started) * 1000, 2)

    memories_started = time.perf_counter()
    memories = await get_active_memories(db, space_id)
    memories_ms = round((time.perf_counter() - memories_started) * 1000, 2)

    embed_started = time.perf_counter()
    query_vector = await embed_task
    embed_ms = round((time.perf_counter() - embed_started) * 1000, 2)

    retrieve_started = time.perf_counter()
    results = await rank_items(db, space_id, query_vector, limit=8)
    retrieve_ms = round((time.perf_counter() - retrieve_started) * 1000, 2)

    logger.info(
        "chat_turn_prepared",
        history_ms=history_ms,
        memories_ms=memories_ms,
        embed_ms=embed_ms,
        retrieve_ms=retrieve_ms,
        history_messages=len(prior_messages),
        memories=len(memories),
        retrieved_items=len(results),
    )
    return prior_messages, results, memories


def _build_llm_messages(
    prior_messages: list[Message],
    results: list[tuple[object, float]],
    memories: list,
    question: str,
) -> list[dict[str, str]]:
    context = format_context_block(results)
    memory_block = (
        "\n\nRelevant background from past conversations in this space:\n"
        + "\n".join(f"- {m.content}" for m in memories)
        if memories
        else ""
    )
    history = [{"role": m.role, "content": m.content} for m in prior_messages]
    return (
        [{"role": "system", "content": SYSTEM_PROMPT}]
        + history
        + [{"role": "user", "content": f"Context:\n{context}{memory_block}\n\nQuestion: {question}"}]
    )


def _sources_payload(results: list[tuple[object, float]]) -> list[dict]:
    return [
        {"item_id": str(item.id), "title": item.title, "kind": item.kind, "score": score}
        for item, score in results
    ]


async def _persist_assistant_message(
    space_id: uuid.UUID,
    conversation_id: uuid.UUID,
    answer: str,
    sources_payload: list[dict] | None,
) -> dict:
    """Persists the completed assistant turn (and the conversation touch) from its own
    short-lived session. The streamed response outlives the request dependency scope,
    and holding any transaction open across generation would pin row locks for the
    whole LLM call -- the exact pathology REQUEST_TIMEOUT_SECONDS guards against."
    """
    async with async_session_factory() as persist_db:
        await activate_rls_for_space(persist_db, space_id)
        message = Message(
            space_id=space_id,
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
            sources=sources_payload,
        )
        persist_db.add(message)
        result = await persist_db.execute(
            scoped_select(Conversation, space_id).where(Conversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        if conversation is not None:
            conversation.updated_at = datetime.now(timezone.utc)
        await persist_db.flush()
        await persist_db.refresh(message)
        # Durability boundary for the streamed answer: without this the session close
        # below rolls the turn back, even though the done event already shipped it.
        await persist_db.commit()
        return MessageOut.model_validate(message).model_dump(mode="json")


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def post_message(
    conversation_id: uuid.UUID,
    payload: MessageCreate,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> MessageOut:
    conversation = await _get_conversation_or_404(db, current.space.id, conversation_id)
    _reject_if_ended(conversation)
    prior_messages, results, memories = await _prepare_turn(
        db, current.space.id, conversation_id, payload.question
    )

    db.add(
        Message(
            space_id=current.space.id,
            conversation_id=conversation_id,
            role="user",
            content=payload.question,
        )
    )

    llm_messages: list[dict[str, str]] | None = None
    if not results:
        answer = "I don't have any relevant information in this space yet."
        sources_payload: list[dict] | None = None
    else:
        llm_messages = _build_llm_messages(prior_messages, results, memories, payload.question)
        sources_payload = _sources_payload(results)

    # Persist the user turn durably BEFORE generation: an upstream failure then costs
    # the answer, not the question, and the row locks held while waiting on the LLM
    # shrink to zero. Committing ends the transaction-local RLS scope, so reactivate it
    # for the writes below.
    await db.commit()
    await activate_rls_for_space(db, current.space.id)

    if llm_messages is not None:
        answer = await generate_completion(llm_messages)

    assistant_message = Message(
        space_id=current.space.id,
        conversation_id=conversation_id,
        role="assistant",
        content=answer,
        sources=sources_payload,
    )
    db.add(assistant_message)

    conversation = await _get_conversation_or_404(db, current.space.id, conversation_id)
    conversation.updated_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(assistant_message)
    return MessageOut.model_validate(assistant_message)


@router.post("/{conversation_id}/messages/stream")
async def post_message_stream(
    conversation_id: uuid.UUID,
    payload: MessageCreate,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    conversation = await _get_conversation_or_404(db, current.space.id, conversation_id)
    _reject_if_ended(conversation)
    prior_messages, results, memories = await _prepare_turn(
        db, current.space.id, conversation_id, payload.question
    )

    sources_payload = _sources_payload(results) if results else []
    llm_messages = (
        _build_llm_messages(prior_messages, results, memories, payload.question)
        if results
        else None
    )

    db.add(
        Message(
            space_id=current.space.id,
            conversation_id=conversation_id,
            role="user",
            content=payload.question,
        )
    )
    # Durable user turn before generation (see post_message).
    await db.commit()

    space_id = current.space.id
    fallback_answer = "I don't have any relevant information in this space yet."
    request_id = request_id_var.get()

    def _ndjson(event: dict) -> str:
        return json.dumps(event, separators=(",", ":")) + "\n"

    async def event_stream():
        token = request_id_var.set(request_id)
        try:
            yield _ndjson({"type": "sources", "sources": sources_payload})
            if llm_messages is None:
                yield _ndjson({"type": "delta", "text": fallback_answer})
                persisted = await _persist_assistant_message(space_id, conversation_id, fallback_answer, None)
                yield _ndjson({"type": "done", "message": persisted})
                return

            accumulated: list[str] = []
            try:
                async for piece in generate_completion_stream(llm_messages):
                    accumulated.append(piece)
                    yield _ndjson({"type": "delta", "text": piece})
            except DomainError as exc:
                yield _ndjson({"type": "error", "error": {"code": exc.code, "message": exc.message}})
                return

            persisted = await _persist_assistant_message(
                space_id, conversation_id, "".join(accumulated), sources_payload or None
            )
            yield _ndjson({"type": "done", "message": persisted})
        finally:
            request_id_var.reset(token)

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.post("/{conversation_id}/end", response_model=ConversationEndedOut, status_code=202)
async def end_conversation(
    conversation_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> ConversationEndedOut:
    """Marks the conversation ended and returns immediately; the durable-memory
    summary trails in a background task so ending never blocks on an LLM call."""
    conversation = await _get_conversation_or_404(db, current.space.id, conversation_id)
    if conversation.ended_at is None:
        conversation.ended_at = datetime.now(timezone.utc)
        await db.commit()

    background_tasks.add_task(_summarize_into_memory, str(current.space.id), str(conversation_id))
    return ConversationEndedOut(status="ending")


async def _summarize_into_memory(space_id_str: str, conversation_id_str: str) -> None:
    """Background tail of end_conversation: summarizes the transcript tail into a
    MemorySummary. Runs on its own session (the request session is long gone) with RLS
    reactivated. Failures are logged, never raised -- the conversation is already
    ended either way, and a lost summary must not surface as a user-facing error."""
    space_id = uuid.UUID(space_id_str)
    conversation_id = uuid.UUID(conversation_id_str)
    try:
        async with async_session_factory() as db:
            await activate_rls_for_space(db, space_id)
            conversation = await _get_conversation_or_404(db, space_id, conversation_id)
            if conversation.ended_at is None:
                return
            messages = (await _get_messages(db, space_id, conversation_id))[-MAX_HISTORY_MESSAGES:]
            if not messages:
                return

            transcript = "\n\n".join(f"{m.role}: {m.content}" for m in messages)
            summary = await generate_completion(
                [
                    {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                    {"role": "user", "content": transcript},
                ]
            )

            if summary.strip().upper() == NO_MEMORY_SENTINEL:
                return

            db.add(
                MemorySummary(
                    space_id=space_id,
                    conversation_id=conversation_id,
                    content=summary,
                    expires_at=datetime.now(timezone.utc) + timedelta(days=get_settings().memory_ttl_days),
                )
            )
            await db.commit()
            logger.info("conversation_memory_created", conversation_id=str(conversation_id))
    except Exception:
        logger.exception("conversation_summary_failed", conversation_id=conversation_id_str)