"""Local embedding generation (see docs/architecture/milestone-1-foundations.md for why
a local sentence-transformers model was chosen over a hosted embeddings API).

`SentenceTransformer.encode()` is a synchronous, CPU-bound call -- awaiting it directly
would block the whole FastAPI event loop for every other in-flight request while it
runs. `embed_text` always runs it via `asyncio.to_thread`.
"""

import asyncio
from functools import lru_cache

import httpx
import huggingface_hub
from sentence_transformers import SentenceTransformer

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _configure_ssl_verification() -> None:
    """Opt-in escape hatch (see Settings.hf_ssl_verify) for corporate networks whose
    TLS-intercepting proxy issues certificates the Python trust store doesn't
    recognize. No-op unless HF_SSL_VERIFY=false is explicitly set -- verification stays
    on by default. `set_client_factory` is huggingface_hub's documented extension point
    for customizing the httpx.Client it uses internally.
    """
    if get_settings().hf_ssl_verify:
        return
    logger.warning(
        "hf_ssl_verify_disabled",
        detail="TLS certificate verification disabled for Hugging Face downloads (HF_SSL_VERIFY=false)",
    )
    huggingface_hub.set_client_factory(
        lambda: httpx.Client(follow_redirects=True, timeout=None, verify=False)
    )


@lru_cache
def get_model() -> SentenceTransformer:
    _configure_ssl_verification()
    return SentenceTransformer(get_settings().embedding_model_name)


def _encode(text: str) -> list[float]:
    return get_model().encode(text, normalize_embeddings=True).tolist()


async def embed_text(text: str) -> list[float]:
    return await asyncio.to_thread(_encode, text)
