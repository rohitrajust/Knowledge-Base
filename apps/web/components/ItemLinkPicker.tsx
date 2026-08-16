"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { api, ApiError } from "@/lib/api-client";
import type { Item, LinkedItem } from "@/lib/types";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";

export function ItemLinkPicker({ spaceId, itemId }: { spaceId: string; itemId: string }) {
  const [links, setLinks] = useState<LinkedItem[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<LinkedItem[]>(`/api/v1/spaces/${spaceId}/items/${itemId}/links`),
      api.get<Item[]>(`/api/v1/spaces/${spaceId}/items`),
    ])
      .then(([linkList, itemList]) => {
        setLinks(linkList);
        setAllItems(itemList);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load links."))
      .finally(() => setLoading(false));
  }, [spaceId, itemId]);

  const linkedIds = new Set(links.map((link) => link.item.id));
  const linkable = allItems.filter((item) => item.id !== itemId && !linkedIds.has(item.id));

  async function handleLink() {
    if (!selected) return;
    setError(null);
    try {
      const link = await api.post<LinkedItem>(`/api/v1/spaces/${spaceId}/items/${itemId}/links`, {
        other_item_id: selected,
      });
      setLinks((prev) => [...prev, link]);
      setSelected("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create link.");
    }
  }

  async function handleUnlink(linkId: string) {
    await api.delete(`/api/v1/spaces/${spaceId}/items/${itemId}/links/${linkId}`);
    setLinks((prev) => prev.filter((link) => link.link_id !== linkId));
  }

  if (loading) {
    return <LoadingState>Loading links...</LoadingState>;
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-gray-700">Linked items</h2>
      {links.length === 0 ? (
        <EmptyState>Not linked to anything yet.</EmptyState>
      ) : (
        <MotionList className="flex flex-col gap-1">
          <AnimatePresence mode="popLayout">
            {links.map((link) => (
              <MotionListItem key={link.link_id} className="flex items-center justify-between text-sm">
                <Link href={`/spaces/${spaceId}/items/${link.item.id}`} className="text-brand-700 hover:underline">
                  {link.item.title}
                </Link>
                <Button variant="ghost-danger" size="sm" onClick={() => handleUnlink(link.link_id)}>
                  Unlink
                </Button>
              </MotionListItem>
            ))}
          </AnimatePresence>
        </MotionList>
      )}

      {linkable.length > 0 && (
        <div className="flex gap-2">
          <Select value={selected} onChange={(event) => setSelected(event.target.value)} className="flex-1">
            <option value="">Link to...</option>
            {linkable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
          <Button variant="secondary" size="sm" onClick={handleLink} disabled={!selected}>
            Link
          </Button>
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>
    </section>
  );
}
