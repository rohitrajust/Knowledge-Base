"""Provider-agnostic LLM access via OpenRouter (https://openrouter.ai), an OpenAI-Chat-
API-compatible gateway that can route a single request across multiple models with
automatic fallback if the primary is rate-limited or down. This is the only module that
knows about OpenRouter specifically -- everything else in the app calls either
`generate_completion` (buffered) or `generate_completion_stream` (token-by-token), so
swapping the gateway later only touches this file.

Latency notes: the streaming variant yields answer text as it arrives so callers can
forward tokens to clients instead of waiting for full generation; both variants share a
generous `max_tokens` ceiling (see Settings.openrouter_max_tokens) that only clips
pathological runaway outputs. The client retries once fast instead of the SDK default
of two backed-off retries -- transient failures are already covered by OpenRouter's
model fallback routing, and every extra silent retry doubles worst-case latency.

Every automated test mocks `generate_completion` / `generate_completion_stream` directly
rather than exercising this module's real client, keeping the test suite free, fast,
and deterministic (consistent with the rest of this project -- see README.md's
"Isolation and auth conventions").
"""

import time
from collections.abc import AsyncIterator
from functools import lru_cache

import openai

from app.config import Settings, get_settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# A hard ceiling on any single LLM call. Without this, a slow/hanging upstream request
# (observed in practice with free-tier OpenRouter models) holds the caller's DB
# transaction -- and its row locks -- open for as long as the call runs, since every
# call site awaits generate_completion() before its next flush/commit. Bounding it here
# means a hung call fails fast as an UpstreamError instead of blocking other requests
# indefinitely. On streamed calls the timeout applies to establishing the stream and to
# time-to-first-token, which is exactly the semantics callers want.
REQUEST_TIMEOUT_SECONDS = 60.0

logger = get_logger(__name__)


@lru_cache
def get_client() -> openai.AsyncOpenAI:
    settings = get_settings()
    return openai.AsyncOpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=settings.openrouter_api_key,
        timeout=REQUEST_TIMEOUT_SECONDS,
        max_retries=1,
    )


def _require_model(settings: Settings) -> None:
    if not settings.openrouter_model:
        raise UpstreamError(
            "AI answers are not configured yet. Set OPENROUTER_API_KEY and "
            "OPENROUTER_MODEL (from https://openrouter.ai/models) to enable them."
        )


def _extra_body(settings: Settings) -> dict:
    return {"models": settings.openrouter_fallback_models} if settings.openrouter_fallback_models else {}


def _completion_kwargs(settings: Settings) -> dict:
    kwargs: dict = {}
    if settings.openrouter_max_tokens:
        kwargs["max_tokens"] = settings.openrouter_max_tokens
    return kwargs


async def generate_completion(messages: list[dict[str, str]]) -> str:
    settings = get_settings()
    _require_model(settings)

    started = time.perf_counter()
    try:
        response = await get_client().chat.completions.create(
            model=settings.openrouter_model,
            messages=messages,
            extra_body=_extra_body(settings),
            **_completion_kwargs(settings),
        )
    except openai.OpenAIError as exc:
        logger.error("openrouter_call_failed", error=str(exc))
        raise UpstreamError("The AI service is temporarily unavailable. Please try again.") from exc

    content = response.choices[0].message.content
    usage = getattr(response, "usage", None)
    logger.info(
        "llm_completion_finished",
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        prompt_tokens=getattr(usage, "prompt_tokens", None),
        completion_tokens=getattr(usage, "completion_tokens", None),
    )
    if not content:
        raise UpstreamError("The AI service returned an empty response. Please try again.")
    return content


async def generate_completion_stream(messages: list[dict[str, str]]) -> AsyncIterator[str]:
    """Yields the answer text token-by-token as it arrives from OpenRouter.

    Raises UpstreamError on connection failure or an empty stream, mirroring the
    buffered variant; provider errors raised mid-stream surface the same way so
    callers can emit one uniform error event downstream.
    """
    settings = get_settings()
    _require_model(settings)

    started = time.perf_counter()
    first_token_logged = False
    chars_emitted = 0
    usage = None
    try:
        stream = await get_client().chat.completions.create(
            model=settings.openrouter_model,
            messages=messages,
            stream=True,
            # Ask for token accounting on the final chunk so TTFT/throughput are
            # measurable end-to-end; providers that ignore it simply omit `usage`.
            stream_options={"include_usage": True},
            extra_body=_extra_body(settings),
            **_completion_kwargs(settings),
        )
        async with stream:
            async for chunk in stream:
                chunk_usage = getattr(chunk, "usage", None)
                if chunk_usage is not None:
                    usage = chunk_usage
                choices = getattr(chunk, "choices", None)
                piece = getattr(getattr(choices[0], "delta", None), "content", None) if choices else None
                if not piece:
                    continue
                if not first_token_logged:
                    logger.info(
                        "llm_stream_first_token", ttft_ms=round((time.perf_counter() - started) * 1000, 2)
                    )
                    first_token_logged = True
                chars_emitted += len(piece)
                yield piece
    except openai.OpenAIError as exc:
        logger.error("openrouter_stream_failed", error=str(exc))
        raise UpstreamError("The AI service is temporarily unavailable. Please try again.") from exc

    logger.info(
        "llm_stream_finished",
        total_ms=round((time.perf_counter() - started) * 1000, 2),
        chars_emitted=chars_emitted,
        prompt_tokens=getattr(usage, "prompt_tokens", None),
        completion_tokens=getattr(usage, "completion_tokens", None),
    )
    if chars_emitted == 0:
        raise UpstreamError("The AI service returned an empty response. Please try again.")
