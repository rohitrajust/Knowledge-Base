"use client";

import dynamic from "next/dynamic";
import type { GraphNode, GraphEdge, Item } from "@/lib/types";
import { LoadingState } from "@/components/ui/LoadingState";

// react-force-graph-2d touches `window`/canvas at module load time and isn't SSR-safe,
// so the actual import must be deferred to the client via next/dynamic({ ssr: false }).
const GraphViewInner = dynamic(() => import("./GraphViewInner").then((mod) => mod.GraphViewInner), {
  ssr: false,
  loading: () => <LoadingState>Loading graph...</LoadingState>,
});

export function GraphView({
  spaceId,
  nodes,
  edges,
  itemsById,
}: {
  spaceId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  itemsById: Map<string, Item>;
}) {
  return <GraphViewInner spaceId={spaceId} nodes={nodes} edges={edges} itemsById={itemsById} />;
}
