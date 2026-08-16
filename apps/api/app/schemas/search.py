from pydantic import BaseModel

from app.schemas.item import ItemOut


class SearchResult(BaseModel):
    item: ItemOut
    score: float
