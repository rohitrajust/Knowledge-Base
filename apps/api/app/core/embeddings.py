"""Local embedding generation (see docs/architecture/milestone-1-foundations.md for why
a local sentence-transformers model was chosen over a hosted embeddings API).

`SentenceTransformer.encode()` is a synchronous, CPU-bound call -- awaiting it directly
would block the whole FastAPI event loop for every other in-flight request while it
runs. `embed_text` always runs it via `asyncio.to_thread`.
"""

import asyncio
from functools import lru_cache

from sentence_transformers import SentenceTransformer

from app.config import get_settings


@lru_cache
def get_model() -> SentenceTransformer:
    return SentenceTransformer(get_settings().embedding_model_name)


def _encode(text: str) -> list[float]:
    return get_model().encode(text, normalize_embeddings=True).tolist()


async def embed_text(text: str) -> list[float]:
    return await asyncio.to_thread(_encode, text)
