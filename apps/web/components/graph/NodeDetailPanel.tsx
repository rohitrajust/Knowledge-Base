"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { snippet } from "@/lib/text";
import { KIND_LABELS } from "@/components/graph/graphTheme";
import type { NodeInfo } from "@/components/graph/nodeInfo";

/** Detail card for the clicked node, floating over the canvas. */
export function NodeDetailPanel({
  info,
  spaceId,
  onClose,
}: {
  info: NodeInfo;
  spaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <GlassPanel
      variant="strong"
      elevated
      className="absolute right-4 bottom-4 z-20 w-72 p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-gray-900">{info.title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-gray-500 hover:text-gray-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Badge>{KIND_LABELS[info.kind]}</Badge>
        {info.updatedAt && (
          <span className="text-xs text-gray-500">
            Updated {new Date(info.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        {info.connectionCount} {info.connectionCount === 1 ? "connection" : "connections"}
        {info.connectedTitles.length > 0 && `: ${info.connectedTitles.join(", ")}`}
        {info.hasMoreConnections && ` +${info.connectionCount - info.connectedTitles.length} more`}
      </p>
      {info.body && <p className="mt-2 text-xs text-gray-600">{snippet(info.body, 300)}</p>}
      <Button
        variant="primary"
        size="sm"
        className="mt-3 w-full"
        onClick={() => router.push(`/spaces/${spaceId}/items/${info.id}`)}
      >
        Open note →
      </Button>
    </GlassPanel>
  );
}
