import logging
import sys

import structlog

from app.config import get_settings
from app.core.context import request_id_var, space_id_var, user_id_var


def _add_request_context(logger, method_name, event_dict):
    request_id = request_id_var.get()
    user_id = user_id_var.get()
    space_id = space_id_var.get()
    if request_id is not None:
        event_dict["request_id"] = request_id
    if user_id is not None:
        event_dict["user_id"] = user_id
    if space_id is not None:
        event_dict["space_id"] = space_id
    return event_dict


def configure_logging() -> None:
    settings = get_settings()

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=settings.log_level,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            _add_request_context,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelNamesMapping().get(settings.log_level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None):
    return structlog.get_logger(name)
