"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { GraphData, Item, ItemKind } from "@/lib/types";
import { GraphView } from "@/components/GraphView";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { KIND_COLORS, KIND_LABELS } from "@/components/graph/graphTheme";
import { cn } from "@/lib/cn";

const ALL_KINDS: ItemKind[] = ["note", "document", "reference"];

export default function GraphPage({ params }: PageProps<'/spaces/[spaceId]/graph'>) {
  const { spaceId } = use(params);

  const [graph, setGraph] = useState<GraphData | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [visibleKinds, setVisibleKinds] = useState<Set<ItemKind>>(new Set(ALL_KINDS));

  useEffect(() => {
    // Reuses the existing items-list endpoint (already used by ItemLinkPicker etc.)
    // purely to get each item's body for the graph's hover preview -- the graph
    // endpoint itself only ever returns id/title/kind, and stays untouched.
    Promise.all([
      api.get<GraphData>(`/api/v1/spaces/${spaceId}/graph`),
      api.get<Item[]>(`/api/v1/spaces/${spaceId}/items`),
    ])
      .then(([graphData, itemList]) => {
        setGraph(graphData);
        setItems(itemList);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load the graph."));
  }, [spaceId]);

  const filtered = useMemo(() => {
    if (!graph) return null;
    const nodes = graph.nodes.filter((node) => visibleKinds.has(node.kind));
    const visibleIds = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    return { nodes, edges };
  }, [graph, visibleKinds]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function toggleKind(kind: ItemKind) {
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  if (error) {
    return (
      <div className="p-6 sm:p-8">
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  }

  // Full-bleed: the canvas fills everything below the 3.5rem TopBar, and all chrome
  // floats over it as frosted overlays. The old layout boxed the graph into a fixed
  // 600px-tall panel inside a max-w-4xl column, which is the single biggest reason a
  // graph of any size felt cramped -- there was simply nowhere for the layout to
  // spread out to.
  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden">
      {!filtered ? (
        <div className="flex h-full items-center justify-center">
          <LoadingState>Loading graph...</LoadingState>
        </div>
      ) : filtered.nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center p-8">
          <EmptyState variant="block" className="max-w-md">
            Nothing to show yet -- capture and link some items first.
          </EmptyState>
        </div>
      ) : (
        <GraphView spaceId={spaceId} nodes={filtered.nodes} edges={filtered.edges} itemsById={itemsById} />
      )}

      <GlassPanel className="absolute top-4 left-4 z-10 flex items-center gap-3 px-3 py-2">
        <h1 className="text-sm font-semibold text-gray-900">Graph</h1>
        <span className="h-4 w-px bg-gray-900/10" aria-hidden="true" />
        <div className="flex items-center gap-2">
          {ALL_KINDS.map((kind) => {
            const on = visibleKinds.has(kind);
            return (
              <label
                key={kind}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition-colors",
                  on ? "bg-white/70 text-gray-900" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleKind(kind)}
                  className="sr-only"
                />
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: on ? KIND_COLORS[kind] : "transparent", boxShadow: `inset 0 0 0 1.5px ${KIND_COLORS[kind]}` }}
                  aria-hidden="true"
                />
                {KIND_LABELS[kind]}
              </label>
            );
          })}
        </div>
        <span className="h-4 w-px bg-gray-900/10" aria-hidden="true" />
        <Link href={`/spaces/${spaceId}`} className="text-xs text-gray-600 hover:text-brand-700">
          ← Back
        </Link>
      </GlassPanel>
    </div>
  );
}
