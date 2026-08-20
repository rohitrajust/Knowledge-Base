"use client";

import { forwardRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { snippet } from "@/lib/text";
import { KIND_LABELS } from "@/components/graph/graphTheme";
import type { NodeInfo } from "@/components/graph/nodeInfo";

/**
 * Hover card, positioned imperatively.
 *
 * The ref is forwarded because the parent drives this element's transform from a
 * requestAnimationFrame loop rather than from React state -- the tooltip has to stay
 * glued to a node that the physics engine is still nudging, and re-rendering on every
 * frame to move it would be far more churn than a hover deserves.
 */
export const NodeTooltip = forwardRef<HTMLDivElement, { info: NodeInfo }>(function NodeTooltip(
  { info },
  ref
) {
  return (
    <GlassPanel
      ref={ref}
      variant="strong"
      className="pointer-events-none absolute top-0 left-0 z-20 w-64 p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold text-gray-900">{info.title}</span>
        <Badge>{KIND_LABELS[info.kind]}</Badge>
      </div>
      {info.updatedAt && (
        <p className="mt-1 text-xs text-gray-500">
          Updated {new Date(info.updatedAt).toLocaleDateString()}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-600">
        {info.connectionCount} {info.connectionCount === 1 ? "connection" : "connections"}
        {info.connectedTitles.length > 0 && `: ${info.connectedTitles.join(", ")}`}
        {info.hasMoreConnections && ` +${info.connectionCount - info.connectedTitles.length} more`}
      </p>
      {info.body && <p className="mt-2 text-xs text-gray-600">{snippet(info.body, 120)}</p>}
    </GlassPanel>
  );
});
