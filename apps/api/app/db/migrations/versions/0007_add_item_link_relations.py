"""add typed relations to item links

Revision ID: a1c4f7b28d90
Revises: 8ab77410e3b4
Create Date: 2026-08-20 14:50:00.000000

Adds `relation` and `direction` to `item_links`, turning what was an undirected,
unlabeled pair table into a typed relation.

Both columns carry a server_default, so every pre-existing row backfills to
`related`/`none` without a data migration -- and any client that still POSTs a link
without a relation keeps working unchanged.

Direction is a separate column rather than a reordering of item_a_id/item_b_id
specifically so the existing `ck_item_links_canonical_order` CHECK and
`uq_item_links_pair` UNIQUE constraint survive untouched: those are what make
self-links and reverse-duplicates impossible, and reordering the pair to express
direction would have cost both.

Relation values are constrained with a CHECK rather than a Postgres ENUM, matching
`ck_items_kind` (0003) -- extending the vocabulary later is then a constraint swap
rather than an ALTER TYPE that cannot run inside a transaction.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1c4f7b28d90"
down_revision: Union[str, Sequence[str], None] = "8ab77410e3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RELATIONS = "('related', 'references', 'depends_on', 'supersedes', 'part_of')"
DIRECTIONS = "('none', 'a_to_b', 'b_to_a')"


def upgrade() -> None:
    op.add_column(
        "item_links",
        sa.Column("relation", sa.String(), nullable=False, server_default="related"),
    )
    op.add_column(
        "item_links",
        sa.Column("direction", sa.String(), nullable=False, server_default="none"),
    )
    op.create_check_constraint("ck_item_links_relation", "item_links", f"relation IN {RELATIONS}")
    op.create_check_constraint("ck_item_links_direction", "item_links", f"direction IN {DIRECTIONS}")


def downgrade() -> None:
    op.drop_constraint("ck_item_links_direction", "item_links", type_="check")
    op.drop_constraint("ck_item_links_relation", "item_links", type_="check")
    op.drop_column("item_links", "direction")
    op.drop_column("item_links", "relation")
