"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { api, ApiError } from "@/lib/api-client";
import type { Item, LinkedItem, RelationType } from "@/lib/types";
import { RELATIONS, RELATION_ORDER, relationLabelFor } from "@/lib/relations";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";

export function ItemLinkPicker({ spaceId, itemId }: { spaceId: string; itemId: string }) {
  const [links, setLinks] = useState<LinkedItem[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState("");
  const [relation, setRelation] = useState<RelationType>("related");
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
        relation,
      });
      setLinks((prev) => [...prev, link]);
      setSelected("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create link.");
    }
  }

  // Retyping goes through PATCH rather than delete-then-recreate: UNIQUE(item_a_id,
  // item_b_id) allows only one link per pair, so recreating would leave a window with
  // no link at all. Issuing it from this item also makes this item the relation's
  // source, which is how a directed relation gets flipped.
  async function handleRetype(linkId: string, next: RelationType) {
    setError(null);
    try {
      const updated = await api.patch<LinkedItem>(
        `/api/v1/spaces/${spaceId}/items/${itemId}/links/${linkId}`,
        { relation: next }
      );
      setLinks((prev) => prev.map((link) => (link.link_id === linkId ? updated : link)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the relation.");
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
              <MotionListItem key={link.link_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/spaces/${spaceId}/items/${link.item.id}`}
                    className="truncate text-brand-700 hover:underline"
                  >
                    {link.item.title}
                  </Link>
                  {/* The badge states what the link actually is right now, including
                      the inverse wording when the relation points at this item. The
                      select beside it is a pure action control, since choosing an
                      option always means "make this item the source". */}
                  <Badge variant={link.relation === "related" ? "neutral" : "brand"}>
                    {relationLabelFor(link.relation, link.direction_out)}
                  </Badge>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Select
                    aria-label={`Change relation for ${link.item.title}`}
                    value=""
                    onChange={(event) => handleRetype(link.link_id, event.target.value as RelationType)}
                    className="py-1 text-xs"
                  >
                    <option value="" disabled>
                      Change...
                    </option>
                    {RELATION_ORDER.map((key) => (
                      <option key={key} value={key}>
                        {RELATIONS[key].label}
                      </option>
                    ))}
                  </Select>
                  <Button variant="ghost-danger" size="sm" onClick={() => handleUnlink(link.link_id)}>
                    Unlink
                  </Button>
                </span>
              </MotionListItem>
            ))}
          </AnimatePresence>
        </MotionList>
      )}

      {linkable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Link to item"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="min-w-0 flex-1"
          >
            <option value="">Link to...</option>
            {linkable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Relation type"
            value={relation}
            onChange={(event) => setRelation(event.target.value as RelationType)}
          >
            {RELATION_ORDER.map((key) => (
              <option key={key} value={key}>
                {RELATIONS[key].label}
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
