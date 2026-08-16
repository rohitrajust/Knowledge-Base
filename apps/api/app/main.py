from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router, health_router
from app.config import get_settings
from app.core.embeddings import get_model
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIDMiddleware

settings = get_settings()
configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the embedding model at startup (not import time -- see app/core/embeddings.py)
    # so the first real request doesn't pay the model-load cost. This also means
    # anything waiting on /health (e.g. Playwright's webServer config) waits for the
    # model to be ready too, not just the HTTP server.
    logger.info("warming_embedding_model")
    get_model()
    logger.info("embedding_model_ready")
    yield


app = FastAPI(title="Mnemo API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestIDMiddleware)

register_exception_handlers(app)

app.include_router(health_router)
app.include_router(api_router)
