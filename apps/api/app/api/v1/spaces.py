import re
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentSpace, get_current_space, get_current_user, require_space_owner
from app.core.errors import DomainError, ForbiddenError, NotFoundError
from app.core.query_scoping import activate_rls_for_space
from app.db.session import get_db
from app.models.space import Space
from app.models.space_membership import SpaceMembership
from app.models.user import User
from app.schemas.membership import MemberInvite, MembershipOut
from app.schemas.space import SpaceCreate, SpaceOut, SpaceUpdate
from app.schemas.user import UserOut

router = APIRouter(prefix="/spaces", tags=["spaces"])


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-") or "space"
    return f"{base}-{uuid.uuid4().hex[:8]}"


@router.post("", response_model=SpaceOut, status_code=201)
async def create_space(
    payload: SpaceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Space:
    # A plain Core insert (no RETURNING) is used here deliberately: `spaces`' only
    # SELECT policy is membership-based, and no membership row exists yet at the moment
    # this space is inserted, so an ORM insert (which asks Postgres to RETURN the new
    # row) would fail RLS. We insert the space, activate its RLS context, insert the
    # owner membership, then re-select the space -- by then the membership makes it
    # visible under `spaces_member_select`.
    new_id = uuid.uuid4()
    await db.execute(
        insert(Space).values(
            id=new_id,
            name=payload.name,
            slug=_slugify(payload.name),
            created_by=user.id,
        )
    )

    await activate_rls_for_space(db, new_id)
    db.add(SpaceMembership(space_id=new_id, user_id=user.id, role="owner"))
    await db.flush()

    result = await db.execute(select(Space).where(Space.id == new_id))
    return result.scalar_one()


@router.get("", response_model=list[SpaceOut])
async def list_spaces(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Space]:
    result = await db.execute(
        select(Space)
        .join(SpaceMembership, SpaceMembership.space_id == Space.id)
        .where(SpaceMembership.user_id == user.id)
        .order_by(Space.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{space_id}", response_model=SpaceOut)
async def get_space(current: CurrentSpace = Depends(get_current_space)) -> Space:
    return current.space


@router.patch("/{space_id}", response_model=SpaceOut)
async def update_space(
    payload: SpaceUpdate,
    current: CurrentSpace = Depends(require_space_owner),
    db: AsyncSession = Depends(get_db),
) -> Space:
    # Slug is deliberately left untouched on rename -- it's used in URLs/deep-links,
    # so keeping it stable avoids silently breaking a link a team has already shared.
    current.space.name = payload.name
    await db.flush()
    await db.refresh(current.space)
    return current.space


@router.delete("/{space_id}", status_code=204)
async def delete_space(
    current: CurrentSpace = Depends(require_space_owner),
    db: AsyncSession = Depends(get_db),
) -> None:
    # Every space-scoped table's space_id FK (via SpaceScopedMixin) and
    # space_memberships.space_id are declared with ON DELETE CASCADE, so deleting
    # the space row is sufficient -- no manual per-table cleanup needed.
    await db.delete(current.space)


@router.get("/{space_id}/members", response_model=list[MembershipOut])
async def list_members(
    current: CurrentSpace = Depends(get_current_space),
    db: AsyncSession = Depends(get_db),
) -> list[MembershipOut]:
    result = await db.execute(
        select(SpaceMembership, User)
        .join(User, User.id == SpaceMembership.user_id)
        .where(SpaceMembership.space_id == current.space.id)
        .order_by(SpaceMembership.created_at)
    )
    members = []
    for membership, user in result.all():
        members.append(
            MembershipOut(
                id=membership.id,
                space_id=membership.space_id,
                user_id=membership.user_id,
                role=membership.role,
                created_at=membership.created_at,
                user=UserOut.model_validate(user),
            )
        )
    return members


@router.post("/{space_id}/members", response_model=MembershipOut, status_code=201)
async def invite_member(
    payload: MemberInvite,
    current: CurrentSpace = Depends(require_space_owner),
    db: AsyncSession = Depends(get_db),
) -> MembershipOut:
    result = await db.execute(select(User).where(User.email == payload.email))
    invitee = result.scalar_one_or_none()
    if invitee is None:
        raise NotFoundError("No user with that email exists among the seeded mock accounts.")

    existing = await db.execute(
        select(SpaceMembership).where(
            SpaceMembership.space_id == current.space.id,
            SpaceMembership.user_id == invitee.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise DomainError("That user is already a member of this space.")

    membership = SpaceMembership(space_id=current.space.id, user_id=invitee.id, role="member")
    db.add(membership)
    await db.flush()

    return MembershipOut(
        id=membership.id,
        space_id=membership.space_id,
        user_id=membership.user_id,
        role=membership.role,
        created_at=membership.created_at,
        user=UserOut.model_validate(invitee),
    )


@router.delete("/{space_id}/members/{user_id}", status_code=204)
async def remove_member(
    user_id: uuid.UUID,
    current: CurrentSpace = Depends(require_space_owner),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(SpaceMembership).where(
            SpaceMembership.space_id == current.space.id,
            SpaceMembership.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise NotFoundError("That user is not a member of this space.")

    if membership.role == "owner":
        owner_count_result = await db.execute(
            select(func.count())
            .select_from(SpaceMembership)
            .where(SpaceMembership.space_id == current.space.id, SpaceMembership.role == "owner")
        )
        if owner_count_result.scalar_one() <= 1:
            raise ForbiddenError("Cannot remove the sole owner of a space.")

    await db.delete(membership)
