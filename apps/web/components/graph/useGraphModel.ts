import { useMemo } from "react";
import type { GraphEdge, GraphNode } from "@/lib/types";

export const MIN_NODE_RADIUS = 4;
export const MAX_NODE_RADIUS = 16;

/** Idle drift is scaled down as the graph grows -- see `driftAmplitudeFor`. */
const MAX_DRIFT = 5;

export interface GraphModel {
  adjacency: Map<string, Set<string>>;
  degree: Map<string, number>;
  /** Node radius, derived from degree so hubs read as hubs. */
  radius: Map<string, number>;
  /** Stable per-node animation phase, hashed once instead of per frame. */
  phase: Map<string, number>;
  /** Signed per-edge bow, so parallel-running edges fan out instead of overlapping. */
  curvature: Map<string, number>;
  titleById: Map<string, string>;
  /** Node ids ordered by degree, descending -- the priority order for label placement. */
  byDegreeDesc: string[];
}

/**
 * Deterministic hash -> [0, 2pi). Previously recomputed for every node and every link
 * endpoint on every frame (three walks of a 36-character UUID per node at 60fps);
 * now computed once per graph and cached in `GraphModel.phase`.
 */
function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (((h >>> 0) % 1000) / 1000) * Math.PI * 2;
}

export function radiusForDegree(degree: number): number {
  return Math.min(MAX_NODE_RADIUS, Math.max(MIN_NODE_RADIUS, MIN_NODE_RADIUS + 3.2 * Math.sqrt(degree)));
}

/**
 * How far nodes may float, given how many there are.
 *
 * Constant-amplitude drift was a major contributor to the "cluttered" feeling: at 30
 * nodes a gentle float reads as alive, but at 200 the entire field wobbles at once and
 * nothing holds still long enough to be read. Amplitude therefore decays with node
 * count and switches off entirely on dense graphs, where stillness is worth more than
 * ambience.
 */
export function driftAmplitudeFor(nodeCount: number): number {
  if (nodeCount <= 0) return 0;
  const scaled = MAX_DRIFT * (40 / nodeCount);
  const clamped = Math.min(MAX_DRIFT, scaled);
  return clamped < 0.6 ? 0 : clamped;
}

export function useGraphModel(nodes: GraphNode[], edges: GraphEdge[]): GraphModel {
  return useMemo(() => {
    const adjacency = new Map<string, Set<string>>();
    const degree = new Map<string, number>();
    for (const node of nodes) {
      adjacency.set(node.id, new Set());
      degree.set(node.id, 0);
    }
    for (const edge of edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    }
    for (const [id, neighbours] of adjacency) degree.set(id, neighbours.size);

    const radius = new Map<string, number>();
    const phase = new Map<string, number>();
    for (const node of nodes) {
      radius.set(node.id, radiusForDegree(degree.get(node.id) ?? 0));
      phase.set(node.id, hashPhase(node.id));
    }

    // Curvature sign and magnitude are hashed from the edge id so an edge always bows
    // the same way across renders -- a random or index-derived value would make edges
    // visibly flip whenever the data was refetched.
    const curvature = new Map<string, number>();
    for (const edge of edges) {
      const h = hashPhase(edge.id);
      const sign = h > Math.PI ? 1 : -1;
      curvature.set(edge.id, sign * (0.08 + (h % 1) * 0.12));
    }

    const titleById = new Map(nodes.map((n) => [n.id, n.title]));
    const byDegreeDesc = [...nodes]
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .map((n) => n.id);

    return { adjacency, degree, radius, phase, curvature, titleById, byDegreeDesc };
  }, [nodes, edges]);
}

/**
 * Hop distance from `rootId`, breadth-first. Used by focus mode to decide what stays
 * lit, what dims, and what disappears.
 */
export function bfsDepth(
  adjacency: Map<string, Set<string>>,
  rootId: string,
  maxDepth: number
): Map<string, number> {
  const depths = new Map<string, number>([[rootId, 0]]);
  let frontier = [rootId];
  for (let d = 1; d <= maxDepth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (!depths.has(neighbour)) {
          depths.set(neighbour, d);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  return depths;
}
