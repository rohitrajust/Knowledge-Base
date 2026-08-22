from pydantic import BaseModel, Field, field_validator

from app.schemas.search import SearchResult


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)

    @field_validator("question")
    @classmethod
    def strip_and_reject_blank(cls, value: str) -> str:
        """Whitespace-only questions pass min_length but would embed garbage,
        retrieve arbitrary nearest items, and ground a confident-sounding answer
        in nothing -- rejected here so every caller gets the same 422."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("question must not be blank")
        return stripped


class AskResponse(BaseModel):
    answer: str
    sources: list[SearchResult]
