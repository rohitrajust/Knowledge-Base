"""Request-scoped context (request id, current user/space) shared by logging and middleware."""

from contextvars import ContextVar

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)
space_id_var: ContextVar[str | None] = ContextVar("space_id", default=None)
