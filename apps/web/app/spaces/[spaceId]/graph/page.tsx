"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { GraphData, Item, ItemKind } from "@/lib/types";
import { GraphView } from "@/components/GraphView";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Graph</h1>
        <Link href={`/spaces/${spaceId}`} className="text-sm text-gray-500 hover:text-brand-700">
          ← Back to space
        </Link>
      </div>

      <div className="flex gap-4 text-sm text-gray-600">
        {ALL_KINDS.map((kind) => (
          <label key={kind} className={cn("flex items-center gap-1.5", visibleKinds.has(kind) && "text-gray-900")}>
            <input
              type="checkbox"
              checked={visibleKinds.has(kind)}
              onChange={() => toggleKind(kind)}
              className="h-3.5 w-3.5 accent-brand-600"
            />
            {kind}
          </label>
        ))}
      </div>

      {!filtered ? (
        <LoadingState>Loading...</LoadingState>
      ) : filtered.nodes.length === 0 ? (
        <EmptyState variant="block">Nothing to show yet -- capture and link some items first.</EmptyState>
      ) : (
        <GraphView spaceId={spaceId} nodes={filtered.nodes} edges={filtered.edges} itemsById={itemsById} />
      )}
    </div>
  );
}
