"""add spaces owner update and delete rls policies

Revision ID: fff236fdc8e0
Revises: 1740090e03f3
Create Date: 2026-08-16 20:09:02.203991

Migration 0002 gave `spaces` only SELECT (membership-keyed) and INSERT (open) policies,
since rename/delete didn't exist yet. With FORCE ROW LEVEL SECURITY already enabled and
no UPDATE/DELETE policy present, Postgres silently denies both by default -- confirmed
by adding the PATCH/DELETE /spaces/{id} endpoints: DELETE matched 0 rows, and UPDATE
raised a StaleDataError, even though the app-layer `require_space_owner` dependency
allowed the request through.

These new policies are scoped to *owners* specifically (via space_memberships.role),
not just members -- mirroring the app-layer `require_space_owner` check as genuine
defense-in-depth (both layers independently enforce the same "owner-only" invariant,
rather than RLS enforcing a weaker "any member" rule underneath a stricter app check).
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'fff236fdc8e0'
down_revision: Union[str, Sequence[str], None] = '1740090e03f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CURRENT_USER_ID = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE POLICY spaces_owner_update ON spaces
        FOR UPDATE
        USING (
            id IN (
                SELECT space_id FROM space_memberships
                WHERE user_id = {CURRENT_USER_ID} AND role = 'owner'
            )
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY spaces_owner_delete ON spaces
        FOR DELETE
        USING (
            id IN (
                SELECT space_id FROM space_memberships
                WHERE user_id = {CURRENT_USER_ID} AND role = 'owner'
            )
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS spaces_owner_delete ON spaces")
    op.execute("DROP POLICY IF EXISTS spaces_owner_update ON spaces")
