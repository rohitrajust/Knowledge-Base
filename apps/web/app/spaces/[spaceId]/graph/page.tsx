"use client";

import { use, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { GraphData, Item } from "@/lib/types";
import { GraphView } from "@/components/GraphView";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function GraphPage({ params }: PageProps<'/spaces/[spaceId]/graph'>) {
  const { spaceId } = use(params);

  const [graph, setGraph] = useState<GraphData | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  if (error) {
    return (
      <div className="p-6 sm:p-8">
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  }

  // Full-bleed: the canvas fills everything below the 3.5rem TopBar, and every control
  // floats over it as a frosted overlay. The old layout boxed the graph into a fixed
  // 600px-tall panel inside a max-w-4xl column, which is the single biggest reason a
  // graph of any size felt cramped.
  //
  // Filtering, search and focus all live inside the graph module rather than here: the
  // controls that drive them float over the canvas and need the same force-graph
  // handle the canvas does, so splitting that state across the page boundary would
  // mean threading a ref back up. This page owns data fetching, and nothing else.
  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden">
      {!graph ? (
        <div className="flex h-full items-center justify-center">
          <LoadingState>Loading graph...</LoadingState>
        </div>
      ) : graph.nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center p-8">
          <EmptyState variant="block" className="max-w-md">
            Nothing to show yet -- capture and link some items first.
          </EmptyState>
        </div>
      ) : (
        <GraphView spaceId={spaceId} nodes={graph.nodes} edges={graph.edges} itemsById={itemsById} />
      )}
    </div>
  );
}
