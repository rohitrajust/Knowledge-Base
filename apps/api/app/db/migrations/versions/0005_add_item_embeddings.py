"""add item embeddings

Revision ID: 3799aba901cd
Revises: d17085623691
Create Date: 2026-08-16 14:50:12.054267

`embedding` is a plain float array column, not a pgvector `Vector` -- similarity is
computed in Python (app/core/retrieval.py) rather than via a SQL-side ANN index, so
Mnemo never needs the pgvector extension installed. `embedding` is nullable -- items
predating this migration are backfilled by app/backfill_embeddings.py rather than being
blocked by a NOT NULL constraint; app/api/v1/search.py explicitly excludes NULL
embeddings from results instead of erroring on them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision: str = '3799aba901cd'
down_revision: Union[str, Sequence[str], None] = 'd17085623691'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('items', sa.Column('embedding', ARRAY(sa.Float), nullable=True))


def downgrade() -> None:
    op.drop_column('items', 'embedding')
