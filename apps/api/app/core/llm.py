"""Provider-agnostic LLM access via OpenRouter (https://openrouter.ai), an OpenAI-Chat-
API-compatible gateway that can route a single request across multiple models with
automatic fallback if the primary is rate-limited or down. This is the only module that
knows about OpenRouter specifically -- everything else in the app calls
`generate_completion`, so swapping the gateway later only touches this file.

Every automated test mocks `generate_completion` directly rather than exercising this
module's real client, keeping the test suite free, fast, and deterministic (consistent
with the rest of this project -- see README.md's "Isolation and auth conventions").
"""

from functools import lru_cache

import openai

from app.config import get_settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# A hard ceiling on any single LLM call. Without this, a slow/hanging upstream request
# (observed in practice with free-tier OpenRouter models) holds the caller's DB
# transaction -- and its row locks -- open for as long as the call runs, since every
# call site awaits generate_completion() before its next flush/commit. Bounding it here
# means a hung call fails fast as an UpstreamError instead of blocking other requests
# indefinitely.
REQUEST_TIMEOUT_SECONDS = 60.0

logger = get_logger(__name__)


@lru_cache
def get_client() -> openai.AsyncOpenAI:
    settings = get_settings()
    return openai.AsyncOpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=settings.openrouter_api_key,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )


async def generate_completion(messages: list[dict[str, str]]) -> str:
    settings = get_settings()
    if not settings.openrouter_model:
        raise UpstreamError(
            "AI answers are not configured yet. Set OPENROUTER_API_KEY and "
            "OPENROUTER_MODEL (from https://openrouter.ai/models) to enable them."
        )

    extra_body = {"models": settings.openrouter_fallback_models} if settings.openrouter_fallback_models else {}

    try:
        response = await get_client().chat.completions.create(
            model=settings.openrouter_model,
            messages=messages,
            extra_body=extra_body,
        )
    except openai.OpenAIError as exc:
        logger.error("openrouter_call_failed", error=str(exc))
        raise UpstreamError("The AI service is temporarily unavailable. Please try again.") from exc

    content = response.choices[0].message.content
    if not content:
        raise UpstreamError("The AI service returned an empty response. Please try again.")
    return content
