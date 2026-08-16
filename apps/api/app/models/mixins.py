"""Mixins shared by tenant-scoped models.

Every future content table (notes, documents, references, note embeddings, graph
edges, conversations, memory entries, ...) added in milestones 2-8 MUST inherit
SpaceScopedMixin and be queried exclusively through `app.core.query_scoping`. Pair
every such table with an RLS policy in a migration (see 0002_enable_pgvector_and_rls.py
for the pattern applied to `space_memberships`) so a missing app-layer filter still
can't leak data across spaces.
"""

import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column


class SpaceScopedMixin:
    space_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
