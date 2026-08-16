"use client";

import type { Item } from "@/lib/types";
import { ListRow } from "@/components/ui/ListRow";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";

const KIND_LABELS: Record<Item["kind"], string> = {
  note: "Note",
  document: "Document",
  reference: "Reference",
};

export function ItemList({ spaceId, items }: { spaceId: string; items: Item[] }) {
  if (items.length === 0) {
    return <EmptyState variant="block">Nothing captured yet -- add a note above.</EmptyState>;
  }

  return (
    <MotionList className="flex flex-col gap-2">
      {items.map((item) => (
        <MotionListItem key={item.id}>
          <ListRow href={`/spaces/${spaceId}/items/${item.id}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">{item.title}</span>
              <Badge>{KIND_LABELS[item.kind]}</Badge>
            </div>
          </ListRow>
        </MotionListItem>
      ))}
    </MotionList>
  );
}
