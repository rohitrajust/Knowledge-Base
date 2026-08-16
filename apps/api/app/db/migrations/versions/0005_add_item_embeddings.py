"""add item embeddings

Revision ID: 3799aba901cd
Revises: d17085623691
Create Date: 2026-08-16 14:50:12.054267

hnsw (not ivfflat) is used for the vector index: ivfflat needs representative data
present at index-build time to cluster well and performs poorly on a near-empty table,
while hnsw builds incrementally and is fine at MVP scale. `embedding` is nullable --
items predating this migration are backfilled by app/backfill_embeddings.py rather than
being blocked by a NOT NULL constraint; app/api/v1/search.py explicitly excludes NULL
embeddings from results instead of erroring on them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = '3799aba901cd'
down_revision: Union[str, Sequence[str], None] = 'd17085623691'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('items', sa.Column('embedding', Vector(384), nullable=True))
    op.execute(
        "CREATE INDEX ix_items_embedding ON items USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_items_embedding")
    op.drop_column('items', 'embedding')
