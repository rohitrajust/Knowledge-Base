"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Item, Membership, Space } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { MemberInviteForm } from "@/components/MemberInviteForm";
import { ItemCreateForm } from "@/components/ItemCreateForm";
import { ItemList } from "@/components/ItemList";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function SpaceDetailPage({ params }: PageProps<'/spaces/[spaceId]'>) {
  const { spaceId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const [space, setSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([
      api.get<Space>(`/api/v1/spaces/${spaceId}`),
      api.get<Membership[]>(`/api/v1/spaces/${spaceId}/members`),
      api.get<Item[]>(`/api/v1/spaces/${spaceId}/items`),
    ])
      .then(([spaceDetail, memberList, itemList]) => {
        setSpace(spaceDetail);
        setMembers(memberList);
        setItems(itemList);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load this space.")
      );
  }, [spaceId]);

  const myMembership = members.find((m) => m.user_id === user?.id);
  const isOwner = myMembership?.role === "owner";

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!nameInput.trim()) return;
    setSavingName(true);
    setRenameError(null);
    try {
      const updated = await api.patch<Space>(`/api/v1/spaces/${spaceId}`, { name: nameInput });
      setSpace(updated);
      setEditingName(false);
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : "Could not rename this space.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/spaces/${spaceId}`);
      router.push("/spaces");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete this space.");
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="p-6 sm:p-8">
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="p-6 sm:p-8">
        <LoadingState>Loading...</LoadingState>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 sm:p-8">
      {editingName ? (
        <form onSubmit={handleRename} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            className="flex-1 text-xl font-semibold"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={savingName}>
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingName(false);
                setRenameError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-900">{space.name}</h1>
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNameInput(space.name);
                setEditingName(true);
              }}
            >
              Rename
            </Button>
          )}
        </div>
      )}
      <ErrorMessage>{renameError}</ErrorMessage>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-700">Knowledge</h2>
        <ItemCreateForm spaceId={space.id} onCreated={(item) => setItems((prev) => [item, ...prev])} />
        <ItemList spaceId={space.id} items={items} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-700">Members</h2>
        <ul className="flex flex-col gap-1.5">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-900">
                {member.user.display_name} <span className="text-gray-400">({member.user.email})</span>
              </span>
              <Badge variant="outline">{member.role}</Badge>
            </li>
          ))}
        </ul>

        {isOwner && (
          <MemberInviteForm
            spaceId={space.id}
            onInvited={(membership) => setMembers((prev) => [...prev, membership])}
          />
        )}
      </section>

      {isOwner && (
        <section className="flex flex-col gap-3 rounded-glass border border-red-300/50 bg-red-50/45 p-4 backdrop-blur-md">
          <h2 className="text-sm font-medium text-red-700">Danger zone</h2>
          <p className="text-sm text-gray-600">
            Deleting this space permanently removes it and everything in it -- notes, links,
            conversations, and memory -- for every member. This cannot be undone.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder={`Type "${space.name}" to confirm`}
              className="flex-1"
            />
            <Button
              variant="danger"
              disabled={deleteConfirmText !== space.name || deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Delete space"}
            </Button>
          </div>
          <ErrorMessage>{deleteError}</ErrorMessage>
        </section>
      )}
    </div>
  );
}
