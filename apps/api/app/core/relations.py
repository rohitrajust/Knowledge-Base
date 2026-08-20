"""Direction arithmetic for typed item links.

Links are stored with `item_a_id < item_b_id` (see app/models/item_link.py), so the
column an item occupies says nothing about its semantic role. These helpers are the
single place that converts between the two views, so the links API and the graph API
can never disagree about which end of an edge is the "from".
"""

import uuid

from app.models.item_link import DIRECTED_RELATIONS


def resolve_direction(relation: str, from_item_id: uuid.UUID, item_a_id: uuid.UUID) -> str:
    """Direction to store for a link created as `from_item_id --relation--> other`."""
    if relation not in DIRECTED_RELATIONS:
        return "none"
    return "a_to_b" if from_item_id == item_a_id else "b_to_a"


def semantic_endpoints(
    item_a_id: uuid.UUID, item_b_id: uuid.UUID, direction: str
) -> tuple[uuid.UUID, uuid.UUID]:
    """(source, target) in relation order -- source is the "from" end.

    Undirected links keep canonical order, which keeps their rendering stable rather
    than dependent on row order.
    """
    if direction == "b_to_a":
        return item_b_id, item_a_id
    return item_a_id, item_b_id


def direction_out(
    item_a_id: uuid.UUID, item_b_id: uuid.UUID, direction: str, viewed_from_id: uuid.UUID
) -> str:
    """Whether the relation points away from, toward, or neither, the item being viewed.

    Lets the item detail page render "References X" vs "Referenced by X" without
    re-deriving canonical-order arithmetic in the client.
    """
    if direction == "none":
        return "none"
    source, _ = semantic_endpoints(item_a_id, item_b_id, direction)
    return "out" if source == viewed_from_id else "in"
