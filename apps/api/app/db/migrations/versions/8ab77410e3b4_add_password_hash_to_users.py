"""add password hash to users

Revision ID: 8ab77410e3b4
Revises: fff236fdc8e0
Create Date: 2026-08-16 21:23:45.602509

Seeded-account login (email only, no credential) is being replaced by real email +
password signup/signin. Existing rows (the three dev/test seed accounts -- see
app/auth/mock_auth.py's SEEDED_USERS) predate this column and have no password, so it
can't be added as NOT NULL in one step: add it nullable, backfill the known seed
accounts with a bcrypt hash of the shared DEV_SEED_PASSWORD, then enforce NOT NULL.
Any other pre-existing row without a hash at that point means an unaccounted-for user
exists in this database -- the NOT NULL step deliberately fails loudly on that rather
than silently leaving a row with no usable password.
"""
from typing import Sequence, Union

import bcrypt
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ab77410e3b4'
down_revision: Union[str, Sequence[str], None] = 'fff236fdc8e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEV_SEED_PASSWORD = "mnemo-dev-password"
SEEDED_EMAILS = ["alice@mnemo.dev", "bob@mnemo.dev", "carol@mnemo.dev"]


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(), nullable=True))

    connection = op.get_bind()
    password_hash = bcrypt.hashpw(DEV_SEED_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    for email in SEEDED_EMAILS:
        connection.execute(
            sa.text("UPDATE users SET password_hash = :hash WHERE email = :email"),
            {"hash": password_hash, "email": email},
        )

    op.alter_column("users", "password_hash", nullable=False)


def downgrade() -> None:
    op.drop_column("users", "password_hash")
