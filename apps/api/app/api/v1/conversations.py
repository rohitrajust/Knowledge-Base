import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space, get_current_user
from app.config import get_settings
from app.core.active_memory import get_active_memories
from app.core.errors import NotFoundError
from app.core.llm import generate_completion
from app.core.prompting import (
    MAX_HISTORY_MESSAGES,
    NO_MEMORY_SENTINEL,
    SUMMARY_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    format_context_block,
)
from app.core.query_scoping import scoped_select
from app.core.retrieval import retrieve_items
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.memory import MemorySummary
from app.models.message import Message
from app.models.user import User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationDetailOut,
    ConversationOut,
    MessageCreate,
    MessageOut,
)
from app.schemas.memory import MemoryOut

router = APIRouter(prefix="/spaces/{space_id}/conversations", tags=["conversations"])


async def _get_conversation_or_404(
    db: AsyncSession, space_id: uuid.UUID, conversation_id: uuid.UUID
) -> Conversation:
    result = await db.execute(scoped_select(Conversation, space_id).where(Conversation.id == conversation_id))
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise NotFoundError("Conversation not found.")
    return conversation


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


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def post_message(
    conversation_id: uuid.UUID,
    payload: MessageCreate,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> MessageOut:
    conversation = await _get_conversation_or_404(db, current.space.id, conversation_id)

    # Bounded to the most recent MAX_HISTORY_MESSAGES so token usage per call has a
    # fixed ceiling regardless of how long the conversation has actually grown.
    prior_messages = (await _get_messages(db, current.space.id, conversation_id))[-MAX_HISTORY_MESSAGES:]

    results = await retrieve_items(db, current.space.id, payload.question, limit=8)
    memories = await get_active_memories(db, current.space.id)

    db.add(
        Message(
            space_id=current.space.id,
            conversation_id=conversation_id,
            role="user",
            content=payload.question,
        )
    )

    if not results:
        answer = "I don't have any relevant information in this space yet."
        sources_payload: list[dict] | None = None
    else:
        context = format_context_block(results)
        memory_block = (
            "\n\nRelevant background from past conversations in this space:\n"
            + "\n".join(f"- {m.content}" for m in memories)
            if memories
            else ""
        )
        history = [{"role": m.role, "content": m.content} for m in prior_messages]
        llm_messages = (
            [{"role": "system", "content": SYSTEM_PROMPT}]
            + history
            + [{"role": "user", "content": f"Context:\n{context}{memory_block}\n\nQuestion: {payload.question}"}]
        )
        answer = await generate_completion(llm_messages)
        sources_payload = [
            {"item_id": str(item.id), "title": item.title, "kind": item.kind, "score": score}
            for item, score in results
        ]

    assistant_message = Message(
        space_id=current.space.id,
        conversation_id=conversation_id,
        role="assistant",
        content=answer,
        sources=sources_payload,
    )
    db.add(assistant_message)

    conversation.updated_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(assistant_message)
    return MessageOut.model_validate(assistant_message)


@router.post("/{conversation_id}/end", response_model=MemoryOut | None)
async def end_conversation(
    conversation_id: uuid.UUID,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> MemoryOut | None:
    conversation = await _get_conversation_or_404(db, current.space.id, conversation_id)
    conversation.ended_at = datetime.now(timezone.utc)

    messages = (await _get_messages(db, current.space.id, conversation_id))[-MAX_HISTORY_MESSAGES:]

    if not messages:
        await db.flush()
        return None

    transcript = "\n\n".join(f"{m.role}: {m.content}" for m in messages)
    summary = await generate_completion(
        [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ]
    )

    if summary.strip().upper() == NO_MEMORY_SENTINEL:
        await db.flush()
        return None

    memory = MemorySummary(
        space_id=current.space.id,
        conversation_id=conversation_id,
        content=summary,
        expires_at=datetime.now(timezone.utc) + timedelta(days=get_settings().memory_ttl_days),
    )
    db.add(memory)
    await db.flush()
    await db.refresh(memory)
    return MemoryOut.model_validate(memory)
