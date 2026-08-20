import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.item import ItemOut

# Mirrors RELATION_TYPES in app/models/item_link.py. Kept as a separate Literal for
# the same reason ItemKind is (app/schemas/item.py): the model owns the DB constraint,
# the schema owns request validation, and neither imports the other's concerns.
RelationType = Literal["related", "references", "depends_on", "supersedes", "part_of"]

# Direction expressed relative to the item being viewed, so a client rendering an
# item's link list never has to know about canonical storage order.
RelationDirectionOut = Literal["out", "in", "none"]


class LinkCreate(BaseModel):
    other_item_id: uuid.UUID
    # Defaulting to "related" is what keeps every existing client -- and the AI
    # suggested-links approve flow -- working unchanged against this endpoint.
    relation: RelationType = "related"


class LinkUpdate(BaseModel):
    relation: RelationType


class LinkedItemOut(BaseModel):
    link_id: uuid.UUID
    created_at: datetime
    relation: RelationType
    direction_out: RelationDirectionOut
    item: ItemOut
