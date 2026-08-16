"""create items

Revision ID: 7dede18c8a60
Revises: cb12c490573d
Create Date: 2026-08-16 14:03:41.662753

`items` is the first real content table (see docs/architecture/milestone-1-foundations.md
for the space_id/RLS convention this follows). Unlike `spaces`/`space_memberships`,
which only needed SELECT+INSERT policies, `items` needs all four commands since members
can read, create, edit, and delete freely -- RLS denies-by-default per command, so a
missing UPDATE or DELETE policy would silently block that command entirely rather than
leak data (fails safe, but worth being deliberate about).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7dede18c8a60'
down_revision: Union[str, Sequence[str], None] = 'cb12c490573d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CURRENT_SPACE_ID = "NULLIF(current_setting('app.current_space_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table('items',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.String(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('url', sa.String(), nullable=True),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('space_id', sa.UUID(), nullable=False),
    sa.CheckConstraint("kind IN ('note', 'document', 'reference')", name='ck_items_kind'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_items_space_id'), 'items', ['space_id'], unique=False)

    op.execute("ALTER TABLE items ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE items FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY items_select ON items FOR SELECT USING (space_id = {CURRENT_SPACE_ID})")
    op.execute(f"CREATE POLICY items_insert ON items FOR INSERT WITH CHECK (space_id = {CURRENT_SPACE_ID})")
    op.execute(f"CREATE POLICY items_update ON items FOR UPDATE USING (space_id = {CURRENT_SPACE_ID}) WITH CHECK (space_id = {CURRENT_SPACE_ID})")
    op.execute(f"CREATE POLICY items_delete ON items FOR DELETE USING (space_id = {CURRENT_SPACE_ID})")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS items_delete ON items")
    op.execute("DROP POLICY IF EXISTS items_update ON items")
    op.execute("DROP POLICY IF EXISTS items_insert ON items")
    op.execute("DROP POLICY IF EXISTS items_select ON items")
    op.execute("ALTER TABLE items NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE items DISABLE ROW LEVEL SECURITY")

    op.drop_index(op.f('ix_items_space_id'), table_name='items')
    op.drop_table('items')
