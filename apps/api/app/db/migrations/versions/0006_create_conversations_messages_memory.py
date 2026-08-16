"""create conversations messages memory summaries

Revision ID: 1740090e03f3
Revises: 3799aba901cd
Create Date: 2026-08-16 15:46:30.908186

Same RLS convention as every prior content table (0003/0004/0005): ENABLE/FORCE ROW
LEVEL SECURITY + 4 per-command policies keyed on
NULLIF(current_setting('app.current_space_id', true), '')::uuid.

Note: autogenerate incorrectly flagged `items`' hnsw vector index (created via raw SQL
in 0005, not declared at the ORM/Index level) as "removed" and wanted to drop/recreate
it here. That's a false positive from diffing a raw-SQL-created index against ORM
model state -- those lines were removed from this migration; the hnsw index is
untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '1740090e03f3'
down_revision: Union[str, Sequence[str], None] = '3799aba901cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CURRENT_SPACE_ID = "NULLIF(current_setting('app.current_space_id', true), '')::uuid"


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY {table}_select ON {table} FOR SELECT USING (space_id = {CURRENT_SPACE_ID})")
    op.execute(f"CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK (space_id = {CURRENT_SPACE_ID})")
    op.execute(
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE "
        f"USING (space_id = {CURRENT_SPACE_ID}) WITH CHECK (space_id = {CURRENT_SPACE_ID})"
    )
    op.execute(f"CREATE POLICY {table}_delete ON {table} FOR DELETE USING (space_id = {CURRENT_SPACE_ID})")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {table}_delete ON {table}")
    op.execute(f"DROP POLICY IF EXISTS {table}_update ON {table}")
    op.execute(f"DROP POLICY IF EXISTS {table}_insert ON {table}")
    op.execute(f"DROP POLICY IF EXISTS {table}_select ON {table}")
    op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.create_table('conversations',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('space_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_conversations_space_id'), 'conversations', ['space_id'], unique=False)

    op.create_table('memory_summaries',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('conversation_id', sa.UUID(), nullable=True),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('space_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_memory_summaries_expires_at'), 'memory_summaries', ['expires_at'], unique=False)
    op.create_index(op.f('ix_memory_summaries_space_id'), 'memory_summaries', ['space_id'], unique=False)

    op.create_table('messages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('conversation_id', sa.UUID(), nullable=False),
    sa.Column('role', sa.String(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('sources', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('space_id', sa.UUID(), nullable=False),
    sa.CheckConstraint("role IN ('user', 'assistant')", name='ck_messages_role'),
    sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_messages_conversation_id'), 'messages', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_messages_space_id'), 'messages', ['space_id'], unique=False)

    _enable_rls('conversations')
    _enable_rls('memory_summaries')
    _enable_rls('messages')


def downgrade() -> None:
    _disable_rls('messages')
    _disable_rls('memory_summaries')
    _disable_rls('conversations')

    op.drop_index(op.f('ix_messages_space_id'), table_name='messages')
    op.drop_index(op.f('ix_messages_conversation_id'), table_name='messages')
    op.drop_table('messages')
    op.drop_index(op.f('ix_memory_summaries_space_id'), table_name='memory_summaries')
    op.drop_index(op.f('ix_memory_summaries_expires_at'), table_name='memory_summaries')
    op.drop_table('memory_summaries')
    op.drop_index(op.f('ix_conversations_space_id'), table_name='conversations')
    op.drop_table('conversations')
