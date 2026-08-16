"""enable pgvector and rls

Revision ID: cb12c490573d
Revises: 2bd2e510e76f
Create Date: 2026-08-16 13:32:19.787436

RLS defense-in-depth pattern for future content tables (milestones 2-8):
every space-scoped table should be `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL
SECURITY`, with a SELECT/INSERT/UPDATE/DELETE policy keyed on
`NULLIF(current_setting('app.current_space_id', true), '')::uuid`, set per-request by
app.core.query_scoping.activate_rls_for_space (called from
app.auth.dependencies.get_current_space).

The `NULLIF(..., '')` wrapper is required, not cosmetic: once a custom GUC name has been
`set_config`'d at least once on a given backend/connection, `current_setting(name, true)`
returns an empty string (not NULL) after the transaction that set it commits and the
LOCAL value resets -- casting `''::uuid` raises `invalid input syntax for type uuid`
instead of evaluating to NULL. Because Postgres does not guarantee left-to-right
short-circuit evaluation between OR'd permissive RLS policies (the planner can evaluate
either policy's expression first), *every* policy referencing one of these session
variables needs this guard, even ones that "shouldn't" be reached for a given query --
otherwise an unrelated, unset variable can throw instead of safely denying.

`spaces` is a special case: it's the root/boundary table, not "content", so its policy
is keyed on membership (via `space_memberships`) rather than `app.current_space_id`,
using `app.current_user_id` (set on every authenticated request by
activate_rls_for_user) instead -- this lets "list my spaces" work without needing to
loop-activate every space first.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'cb12c490573d'
down_revision: Union[str, Sequence[str], None] = '2bd2e510e76f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CURRENT_USER_ID = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"
CURRENT_SPACE_ID = "NULLIF(current_setting('app.current_space_id', true), '')::uuid"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # --- spaces: membership-keyed SELECT, open INSERT (any authenticated user may
    # create a space; the app assigns the creator as owner in the same transaction) ---
    op.execute("ALTER TABLE spaces ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE spaces FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY spaces_member_select ON spaces
        FOR SELECT
        USING (
            id IN (
                SELECT space_id FROM space_memberships
                WHERE user_id = {CURRENT_USER_ID}
            )
        )
        """
    )
    op.execute("CREATE POLICY spaces_insert ON spaces FOR INSERT WITH CHECK (true)")

    # --- space_memberships: a user can always see their own membership rows (needed to
    # list "my spaces"); anyone with the RLS space context activated can see/manage all
    # membership rows for that space (needed for the members panel) ---
    op.execute("ALTER TABLE space_memberships ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE space_memberships FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY memberships_self_select ON space_memberships
        FOR SELECT
        USING (user_id = {CURRENT_USER_ID})
        """
    )
    op.execute(
        f"""
        CREATE POLICY memberships_space_select ON space_memberships
        FOR SELECT
        USING (space_id = {CURRENT_SPACE_ID})
        """
    )
    op.execute(
        f"""
        CREATE POLICY memberships_space_insert ON space_memberships
        FOR INSERT
        WITH CHECK (space_id = {CURRENT_SPACE_ID})
        """
    )
    op.execute(
        f"""
        CREATE POLICY memberships_space_delete ON space_memberships
        FOR DELETE
        USING (space_id = {CURRENT_SPACE_ID})
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS memberships_space_delete ON space_memberships")
    op.execute("DROP POLICY IF EXISTS memberships_space_insert ON space_memberships")
    op.execute("DROP POLICY IF EXISTS memberships_space_select ON space_memberships")
    op.execute("DROP POLICY IF EXISTS memberships_self_select ON space_memberships")
    op.execute("ALTER TABLE space_memberships NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE space_memberships DISABLE ROW LEVEL SECURITY")

    op.execute("DROP POLICY IF EXISTS spaces_insert ON spaces")
    op.execute("DROP POLICY IF EXISTS spaces_member_select ON spaces")
    op.execute("ALTER TABLE spaces NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE spaces DISABLE ROW LEVEL SECURITY")

    op.execute("DROP EXTENSION IF EXISTS vector")
