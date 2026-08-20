import type { GraphNode, Item } from "@/lib/types";
import type { GraphModel } from "@/components/graph/useGraphModel";

const MAX_CONNECTED_TITLES = 3;

export interface NodeInfo {
  id: string;
  title: string;
  kind: GraphNode["kind"];
  updatedAt: string | null;
  connectionCount: number;
  connectedTitles: string[];
  hasMoreConnections: boolean;
  body?: string;
}

/**
 * One resolver behind both the hover tooltip and the click panel, so their content
 * can never drift apart.
 *
 * Backed by the items list the graph page fetches alongside /graph purely to obtain
 * each item's body and timestamps: the graph endpoint itself returns only id, title
 * and kind, and is deliberately left that way.
 */
export function resolveNodeInfo(id: string, model: GraphModel, itemsById: Map<string, Item>): NodeInfo {
  const item = itemsById.get(id);
  const connections = Array.from(model.adjacency.get(id) ?? []);
  return {
    id,
    title: item?.title ?? model.titleById.get(id) ?? "Untitled",
    kind: item?.kind ?? "note",
    updatedAt: item?.updated_at ?? null,
    connectionCount: connections.length,
    connectedTitles: connections
      .slice(0, MAX_CONNECTED_TITLES)
      .map((cid) => model.titleById.get(cid) ?? "Untitled"),
    hasMoreConnections: connections.length > MAX_CONNECTED_TITLES,
    body: item?.body,
  };
}
