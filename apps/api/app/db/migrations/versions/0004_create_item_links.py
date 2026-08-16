"""create item links

Revision ID: d17085623691
Revises: 7dede18c8a60
Create Date: 2026-08-16 14:20:19.170489

Same convention as `items` (0003): RLS enabled+forced with all four command policies
keyed on `NULLIF(current_setting('app.current_space_id', true), '')::uuid`. See
docs/architecture/milestone-1-foundations.md for the rationale behind NULLIF and FORCE.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd17085623691'
down_revision: Union[str, Sequence[str], None] = '7dede18c8a60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CURRENT_SPACE_ID = "NULLIF(current_setting('app.current_space_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table('item_links',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('item_a_id', sa.UUID(), nullable=False),
    sa.Column('item_b_id', sa.UUID(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('space_id', sa.UUID(), nullable=False),
    sa.CheckConstraint('item_a_id < item_b_id', name='ck_item_links_canonical_order'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['item_a_id'], ['items.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['item_b_id'], ['items.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('item_a_id', 'item_b_id', name='uq_item_links_pair')
    )
    op.create_index(op.f('ix_item_links_item_a_id'), 'item_links', ['item_a_id'], unique=False)
    op.create_index(op.f('ix_item_links_item_b_id'), 'item_links', ['item_b_id'], unique=False)
    op.create_index(op.f('ix_item_links_space_id'), 'item_links', ['space_id'], unique=False)

    op.execute("ALTER TABLE item_links ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE item_links FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY item_links_select ON item_links FOR SELECT USING (space_id = {CURRENT_SPACE_ID})")
    op.execute(f"CREATE POLICY item_links_insert ON item_links FOR INSERT WITH CHECK (space_id = {CURRENT_SPACE_ID})")
    op.execute(f"CREATE POLICY item_links_update ON item_links FOR UPDATE USING (space_id = {CURRENT_SPACE_ID}) WITH CHECK (space_id = {CURRENT_SPACE_ID})")
    op.execute(f"CREATE POLICY item_links_delete ON item_links FOR DELETE USING (space_id = {CURRENT_SPACE_ID})")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS item_links_delete ON item_links")
    op.execute("DROP POLICY IF EXISTS item_links_update ON item_links")
    op.execute("DROP POLICY IF EXISTS item_links_insert ON item_links")
    op.execute("DROP POLICY IF EXISTS item_links_select ON item_links")
    op.execute("ALTER TABLE item_links NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE item_links DISABLE ROW LEVEL SECURITY")

    op.drop_index(op.f('ix_item_links_space_id'), table_name='item_links')
    op.drop_index(op.f('ix_item_links_item_b_id'), table_name='item_links')
    op.drop_index(op.f('ix_item_links_item_a_id'), table_name='item_links')
    op.drop_table('item_links')
