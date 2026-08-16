import uuid

from pydantic import BaseModel

from app.schemas.item import ItemKind


class GraphNode(BaseModel):
    id: uuid.UUID
    title: str
    kind: ItemKind


class GraphEdge(BaseModel):
    id: uuid.UUID
    source: uuid.UUID
    target: uuid.UUID


class GraphData(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
