"""Shared prompt-building pieces for grounded Q&A (app/api/v1/qa.py) and multi-turn
conversations (app/api/v1/conversations.py), so both build prompts identically instead
of duplicating logic.
"""

from app.models.item import Item

# Caps how many prior conversation messages get included when building context for a
# new question or an end-of-conversation summary, regardless of how long the
# conversation has actually grown -- this bounds token usage per LLM call at a fixed
# ceiling instead of letting it grow linearly with conversation length. See
# README.md's "Isolation and auth conventions" for the reasoning.
MAX_HISTORY_MESSAGES = 20

SYSTEM_PROMPT = (
    "You are Mnemo, a knowledge assistant for this team's notes. Answer the question "
    "using ONLY the numbered context items below -- do not use outside knowledge. Cite "
    "the context items you rely on inline using [n] notation. If the context doesn't "
    "contain enough information to answer, say so explicitly instead of guessing."
)

# Anti-hallucination guardrail for memory extraction: the model must use only what's
# actually in the transcript, and must explicitly say when there's nothing durable
# worth remembering rather than always producing a summary.
SUMMARY_SYSTEM_PROMPT = (
    "You are extracting durable, reusable project knowledge from a team conversation "
    "for shared long-term memory. Summarize ONLY facts, decisions, or conclusions that "
    "were explicitly stated below -- never infer, guess, or add information that was "
    "not actually said. Ignore small talk and clarifying back-and-forth that isn't "
    "durable project knowledge worth remembering weeks from now.\n"
    "If nothing in this conversation is worth remembering long-term, respond with "
    "exactly the single word: NONE. Otherwise, respond with a concise 2-5 sentence "
    "summary of only the durable facts/decisions."
)

NO_MEMORY_SENTINEL = "NONE"


def format_context_block(results: list[tuple[Item, float]]) -> str:
    """Numbered `[n] title\\nbody` blocks matching the [n]-citation instruction in
    SYSTEM_PROMPT.
    """
    return "\n\n".join(f"[{i}] {item.title}\n{item.body}" for i, (item, _score) in enumerate(results, start=1))
