import uuid

from pydantic import BaseModel

from app.schemas.item import ItemKind
from app.schemas.link import RelationType


class GraphNode(BaseModel):
    id: uuid.UUID
    title: str
    kind: ItemKind


class GraphEdge(BaseModel):
    """An edge in relation order: `source` is the "from" end of the relation.

    For undirected relations source/target fall back to canonical storage order and
    `directed` is False, so a renderer knows not to draw an arrowhead.
    """

    id: uuid.UUID
    source: uuid.UUID
    target: uuid.UUID
    relation: RelationType
    directed: bool


class GraphData(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
