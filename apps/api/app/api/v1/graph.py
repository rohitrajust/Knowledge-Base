from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space
from app.core.query_scoping import scoped_select
from app.core.relations import semantic_endpoints
from app.db.session import get_db
from app.models.item import Item
from app.models.item_link import ItemLink
from app.schemas.graph import GraphData, GraphEdge, GraphNode

router = APIRouter(prefix="/spaces/{space_id}/graph", tags=["graph"])


@router.get("", response_model=GraphData)
async def get_graph(
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> GraphData:
    items_result = await db.execute(scoped_select(Item, current.space.id))
    nodes = [GraphNode(id=item.id, title=item.title, kind=item.kind) for item in items_result.scalars().all()]

    links_result = await db.execute(scoped_select(ItemLink, current.space.id))
    edges = []
    for link in links_result.scalars().all():
        # Emitted in relation order rather than storage order, so the client can draw
        # an arrowhead without knowing anything about canonical column ordering.
        source, target = semantic_endpoints(link.item_a_id, link.item_b_id, link.direction)
        edges.append(
            GraphEdge(
                id=link.id,
                source=source,
                target=target,
                relation=link.relation,
                directed=link.direction != "none",
            )
        )

    return GraphData(nodes=nodes, edges=edges)
