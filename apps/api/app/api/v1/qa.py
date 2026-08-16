from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space
from app.core.llm import generate_completion
from app.core.prompting import SYSTEM_PROMPT, format_context_block
from app.core.retrieval import retrieve_items
from app.db.session import get_db
from app.models.item import Item
from app.schemas.qa import AskRequest, AskResponse
from app.schemas.search import SearchResult

router = APIRouter(prefix="/spaces/{space_id}/ask", tags=["qa"])

NO_CONTEXT_ANSWER = "I don't have any relevant information in this space yet."


def _build_messages(results: list[tuple[Item, float]], question: str) -> list[dict[str, str]]:
    context = format_context_block(results)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
    ]


@router.post("", response_model=AskResponse)
async def ask(
    payload: AskRequest,
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> AskResponse:
    results = await retrieve_items(db, current.space.id, payload.question, limit=8)
    if not results:
        # No embedded items in the space to ground an answer in -- skip the LLM call
        # entirely rather than let it invent an answer with zero grounding.
        return AskResponse(answer=NO_CONTEXT_ANSWER, sources=[])

    messages = _build_messages(results, payload.question)
    answer = await generate_completion(messages)

    sources = [SearchResult(item=item, score=score) for item, score in results]
    return AskResponse(answer=answer, sources=sources)
