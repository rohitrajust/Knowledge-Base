from fastapi import APIRouter

from app.api.v1 import auth, conversations, graph, health, items, links, memory, qa, search, spaces, suggestions

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(spaces.router)
api_router.include_router(items.router)
api_router.include_router(links.router)
api_router.include_router(graph.router)
api_router.include_router(search.router)
api_router.include_router(qa.router)
api_router.include_router(conversations.router)
api_router.include_router(memory.router)
api_router.include_router(suggestions.router)

# Health checks are unauthenticated and outside /api/v1 versioning (see app/main.py).
health_router = health.router
