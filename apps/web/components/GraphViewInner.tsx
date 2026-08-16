"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { X } from "lucide-react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import type { GraphNode, GraphEdge, Item } from "@/lib/types";
import { motionTokens } from "@/lib/motionTokens";
import { snippet } from "@/lib/text";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const KIND_COLORS: Record<GraphNode["kind"], string> = {
  note: "#2563eb",
  document: "#16a34a",
  reference: "#d97706",
};

const KIND_LABELS: Record<GraphNode["kind"], string> = {
  note: "Note",
  document: "Document",
  reference: "Reference",
};

const HIGHLIGHT_RING = "#12584f"; // brand-700
const NEIGHBOR_RING = "#3ba99b"; // brand-400
const LINK_COLOR = "#c7cdd0";
const LINK_COLOR_ACTIVE = "#146d62"; // brand-600
const BASE_RADIUS = 5;
// Idle drift: how far (px, in graph-space) and how fast nodes float. Large enough
// to read as "alive" at a glance without nodes visibly leaving their neighborhood.
const DRIFT_AMPLITUDE = 5;
const DRIFT_FREQ_X = 0.45;
const DRIFT_FREQ_Y = 0.36;
// force-graph repaints its offscreen hit-test ("shadow") canvas on a fixed 800ms
// throttle (HOVER_CANVAS_THROTTLE_DELAY in force-graph's source), independent of our
// own per-frame drift animation. If the hit-area were painted at the node's live
// drifted position (like the visible node is), it would go stale for up to 800ms
// while the node keeps drifting away from it, causing hover to intermittently miss
// or flicker depending on the drift phase at the moment of the last shadow-canvas
// repaint. Painting it at the node's stable (undrifted) base position instead, with
// a radius that fully covers the drift envelope, makes the hit-area immune to that
// staleness -- it never needs to "catch up" to the visible node because it already
// covers every position the node can drift to.
const POINTER_AREA_RADIUS = BASE_RADIUS + DRIFT_AMPLITUDE + 3;
const MAX_CONNECTED_TITLES = 3;
const PULSE_AMPLITUDE = 0.12; // +-12% radius "breathing"
const PULSE_FREQ = 0.6;
const DIMMED_ALPHA = 0.22;

// Read once -- this drives a canvas draw loop, not a React re-render, so it doesn't
// need to be reactive to a live OS-setting change the way a DOM animation would.
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Deterministic per-node phase (and a derived frequency multiplier) so each node
// floats and pulses on its own cycle without looking mechanically synchronized --
// cheap to recompute per frame for the node counts this app deals with.
function phaseFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000 * Math.PI * 2;
}

function endpointId(endpoint: unknown): string | undefined {
  if (endpoint == null) return undefined;
  if (typeof endpoint === "object") return String((endpoint as { id?: unknown }).id);
  return String(endpoint);
}

function driftOffset(id: string, t: number): { dx: number; dy: number } {
  if (prefersReducedMotion) return { dx: 0, dy: 0 };
  const phase = phaseFor(id);
  const freqVariance = 0.8 + (phase / (Math.PI * 2)) * 0.4; // ~0.8x - 1.2x per node
  return {
    dx: Math.sin(t * DRIFT_FREQ_X * freqVariance + phase) * DRIFT_AMPLITUDE,
    dy: Math.cos(t * DRIFT_FREQ_Y * freqVariance + phase * 1.7) * DRIFT_AMPLITUDE,
  };
}

interface NodeInfo {
  id: string;
  title: string;
  kind: GraphNode["kind"];
  updatedAt: string | null;
  connectionCount: number;
  connectedTitles: string[];
  hasMoreConnections: boolean;
  body?: string;
}

export function GraphViewInner({
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
  const router = useRouter();
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphEdge>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Hover state used by the canvas render loop lives in a ref, not React state:
  // nodeCanvasObject/linkCanvasObject are read by force-graph's own render loop
  // every frame (see autoPauseRedraw below), so a plain mutable ref is enough --
  // routing hover through setState there would force React to re-render and
  // rebuild the `graphData` object on every mouse-move.
  const hoveredIdRef = useRef<string | null>(null);
  // Holds a reference to the live node object (mutated in place by the physics
  // engine every tick), not a copy of its x/y -- a frozen {x,y} snapshot taken at
  // hover-start would drift away from the node's actual drawn position as soon as
  // the simulation nudges it again, causing the tooltip to visibly detach from the
  // node it's supposed to be glued to (the same class of stale-coordinate bug
  // already fixed for edges/hit-testing, just not yet applied here).
  const hoveredBaseRef = useRef<{ id: string; node: NodeObject<GraphNode> & { x?: number; y?: number } } | null>(null);

  // The hover tooltip and the click-selection panel are both genuinely
  // React-rendered content, so they're the two pieces of interaction state that
  // do need to live in React state -- they only change on hover-target/click, not
  // every animation frame, so this doesn't reintroduce the graphData-churn problem
  // the ref above exists to avoid.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ForceGraph2D's width/height props default to window.innerWidth/innerHeight when
  // omitted -- it does not measure its own container. Without this, the canvas was
  // sized to the full browser viewport while this component's bordered container
  // only shows an overflow-hidden crop of it, so the graph's true center (centered
  // relative to the oversized canvas) fell outside the visible crop, rendering nodes
  // bunched toward one edge instead of centered. Tracking the container's actual
  // size and passing it through keeps the canvas -- and therefore the graph's
  // center -- matched to what's actually visible.
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDimensions({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [edges]);

  const titleById = useMemo(() => new Map(nodes.map((n) => [n.id, n.title])), [nodes]);

  // force-graph re-heats the entire physics simulation AND wipes its shadow-canvas
  // hit-test color registry (see CanvasForceGraph's graphData onChange in
  // force-graph's source: `state.forceLayout.stop().alpha(1)`, and
  // `!d.hasOwnProperty('__indexColor') -> state.colorTracker.reset()`) any time it
  // receives a graphData object containing node/link objects it hasn't seen before
  // -- which a fresh `{ ...node }` copy always is, even when the underlying data is
  // unchanged. Building this inline in JSX (recreated on every render) meant every
  // hover/selection state change -- including the hover state changes this
  // component itself triggers -- silently restarted the simulation and reassigned
  // hit-test colors, which is why nodes never visually settled and hover/click
  // detection intermittently missed. Memoizing on [nodes, edges] keeps the same
  // object identities across renders that don't actually change the graph's data.
  const graphData = useMemo(
    () => ({
      nodes: nodes.map((node) => ({ ...node })),
      links: edges.map((edge) => ({ ...edge })),
    }),
    [nodes, edges]
  );

  // Single source of truth for both the hover tooltip and the click panel, so
  // their content can never drift apart -- backed by the items list the graph
  // page already fetches (alongside /graph) purely to get each item's body/dates
  // for these UI reads; the graph endpoint itself only ever returns id/title/kind.
  function resolveNodeInfo(id: string): NodeInfo {
    const item = itemsById.get(id);
    const connections = Array.from(adjacency.get(id) ?? []);
    const connectedTitles = connections.slice(0, MAX_CONNECTED_TITLES).map((cid) => titleById.get(cid) ?? "Untitled");
    return {
      id,
      title: item?.title ?? titleById.get(id) ?? "Untitled",
      kind: item?.kind ?? "note",
      updatedAt: item?.updated_at ?? null,
      connectionCount: connections.length,
      connectedTitles,
      hasMoreConnections: connections.length > MAX_CONNECTED_TITLES,
      body: item?.body,
    };
  }

  // Keeps the tooltip glued to its node's actual (drifting) screen position every
  // frame, without a React re-render: it recomputes the same drift offset used in
  // nodeCanvasObject from the node's base graph-space position (captured once at
  // hover-start, stable once the physics simulation has settled) and converts to
  // screen pixels via force-graph's own pan/zoom-aware coordinate transform.
  useEffect(() => {
    if (!hoveredNodeId) return;
    let rafId: number;
    const tick = () => {
      const base = hoveredBaseRef.current;
      const fg = fgRef.current;
      const tooltip = tooltipRef.current;
      const container = containerRef.current;
      if (base && fg && tooltip && container && base.node.x !== undefined && base.node.y !== undefined) {
        const t = performance.now() / 1000;
        const { dx, dy } = driftOffset(base.id, t);
        const screen = fg.graph2ScreenCoords(base.node.x + dx, base.node.y + dy);
        const maxLeft = Math.max(8, container.clientWidth - 272);
        const maxTop = Math.max(8, container.clientHeight - 160);
        const left = Math.min(Math.max(screen.x + 14, 8), maxLeft);
        const top = Math.min(Math.max(screen.y - 14, 8), maxTop);
        tooltip.style.transform = `translate(${left}px, ${top}px)`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [hoveredNodeId]);

  // Edges/neighbors highlight for whichever node is active -- hovered takes
  // precedence, falling back to the clicked/selected node so its connections
  // stay clearly visible even after the mouse moves away from it.
  function activeHighlightId(): string | null {
    return hoveredIdRef.current ?? selectedId;
  }

  function isLinkHighlighted(link: unknown): boolean {
    const highlightId = activeHighlightId();
    if (!highlightId) return false;
    return (
      endpointId((link as { source?: unknown }).source) === highlightId ||
      endpointId((link as { target?: unknown }).target) === highlightId
    );
  }

  return (
    <motion.div
      ref={containerRef}
      initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth }}
      className="relative h-[600px] w-full overflow-hidden rounded-xl border border-border bg-surface"
    >
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeId="id"
        nodeRelSize={BASE_RADIUS}
        width={dimensions.width}
        height={dimensions.height}
        // Keeps the canvas repainting every animation frame even once the d3-force
        // simulation has settled, so the drift/pulse below stay visible without
        // ever mutating real node.x/node.y -- the physics engine itself is untouched.
        autoPauseRedraw={!prefersReducedMotion}
        onNodeHover={(node) => {
          const n = node as (NodeObject<GraphNode> & { x?: number; y?: number }) | null;
          hoveredIdRef.current = n ? String(n.id) : null;
          hoveredBaseRef.current = n ? { id: String(n.id), node: n } : null;
          setHoveredNodeId(n ? String(n.id) : null);
        }}
        onNodeClick={(node) => setSelectedId(String((node as GraphNode).id))}
        onBackgroundClick={() => setSelectedId(null)}
        // Force-graph's hit-testing runs on a separate invisible "shadow canvas"
        // that it only repaints on an internal 800ms throttle (see POINTER_AREA_RADIUS
        // comment above) -- painting the hit-area at the node's live drifted position
        // would go stale between repaints as the node keeps drifting, causing hover to
        // intermittently miss. Painting it at the node's stable base x/y with a radius
        // that covers the full drift envelope sidesteps that staleness entirely: the
        // hit-area already covers wherever the node visually drifts to, whenever the
        // shadow canvas last happened to repaint.
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as NodeObject<GraphNode> & { x: number; y: number };
          if (n.x === undefined || n.y === undefined) return;
          ctx.beginPath();
          ctx.arc(n.x, n.y, POINTER_AREA_RADIUS, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        // Edges are drawn entirely here rather than via linkColor/linkWidth/
        // linkDirectionalParticles*: force-graph's defaults for all of those draw
        // from the raw, undrifted link.source.x/y and link.target.x/y, which would
        // make nodes visually detach from their edges (the node is painted at its
        // drifted position, but the edge would stay pinned to the old coordinates).
        // Recomputing the same driftOffset() for both endpoints here means a line
        // can never terminate anywhere other than where its node is actually drawn
        // that frame -- and the traveling particle is hand-interpolated along that
        // same drifted segment, so it can't separate from the line either.
        linkCanvasObjectMode={() => "replace"}
        linkCanvasObject={(link, ctx) => {
          const source = (link as { source?: unknown }).source;
          const target = (link as { target?: unknown }).target;
          if (typeof source !== "object" || source === null || typeof target !== "object" || target === null) return;
          const s = source as { id?: unknown; x?: number; y?: number };
          const e = target as { id?: unknown; x?: number; y?: number };
          if (s.x === undefined || s.y === undefined || e.x === undefined || e.y === undefined) return;

          const t = performance.now() / 1000;
          const sourceDrift = driftOffset(String(s.id), t);
          const targetDrift = driftOffset(String(e.id), t);
          const sx = s.x + sourceDrift.dx;
          const sy = s.y + sourceDrift.dy;
          const ex = e.x + targetDrift.dx;
          const ey = e.y + targetDrift.dy;

          const active = isLinkHighlighted(link);
          const color = active ? LINK_COLOR_ACTIVE : LINK_COLOR;

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.strokeStyle = color;
          ctx.lineWidth = active ? 2.5 : 1;
          ctx.stroke();

          if (!prefersReducedMotion) {
            // Cycles per second -- matches the pace of the previous native
            // linkDirectionalParticles config (~0.24/s default, ~0.48/s active).
            const speed = active ? 0.48 : 0.24;
            const progress = (t * speed) % 1;
            ctx.beginPath();
            ctx.arc(sx + (ex - sx) * progress, sy + (ey - sy) * progress, active ? 2.2 : 1.4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }
        }}
        nodeCanvasObject={(node, ctx) => {
          const n = node as NodeObject<GraphNode> & { x: number; y: number };
          if (n.x === undefined || n.y === undefined) return;

          const isHovered = hoveredIdRef.current === n.id;
          const isSelected = selectedId === n.id;
          const highlightId = activeHighlightId();
          const isHighlighted = highlightId === n.id;
          const isNeighbor = highlightId !== null && !isHighlighted && (adjacency.get(highlightId)?.has(String(n.id)) ?? false);
          const dimmed = highlightId !== null && !isHighlighted && !isNeighbor;

          const t = performance.now() / 1000;
          const { dx, dy } = driftOffset(String(n.id), t);
          const drawX = n.x + dx;
          const drawY = n.y + dy;

          const pulse = prefersReducedMotion
            ? 0
            : Math.sin(t * PULSE_FREQ + phaseFor(String(n.id)) * 2.3) * PULSE_AMPLITUDE;
          const baseRadius = isHovered ? BASE_RADIUS * 1.4 : isSelected ? BASE_RADIUS * 1.6 : BASE_RADIUS;
          const radius = baseRadius * (1 + pulse);

          ctx.globalAlpha = dimmed ? DIMMED_ALPHA : 1;
          ctx.beginPath();
          ctx.arc(drawX, drawY, radius, 0, 2 * Math.PI);
          ctx.fillStyle = KIND_COLORS[n.kind];
          ctx.fill();

          if (isHovered || isSelected) {
            ctx.lineWidth = 1.75;
            ctx.strokeStyle = HIGHLIGHT_RING;
            ctx.stroke();
          } else if (isNeighbor) {
            ctx.lineWidth = 1.25;
            ctx.strokeStyle = NEIGHBOR_RING;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }}
      />

      {hoveredNodeId && hoveredNodeId !== selectedId && (() => {
        const info = resolveNodeInfo(hoveredNodeId);
        return (
          <div
            ref={tooltipRef}
            className="pointer-events-none absolute top-0 left-0 z-10 w-64 rounded-lg border border-border bg-surface p-3 text-sm shadow-lg"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-900">{info.title}</span>
              <Badge>{KIND_LABELS[info.kind]}</Badge>
            </div>
            {info.updatedAt && (
              <p className="mt-1 text-xs text-gray-400">Updated {new Date(info.updatedAt).toLocaleDateString()}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {info.connectionCount} {info.connectionCount === 1 ? "connection" : "connections"}
              {info.connectedTitles.length > 0 && `: ${info.connectedTitles.join(", ")}`}
              {info.hasMoreConnections && ` +${info.connectionCount - info.connectedTitles.length} more`}
            </p>
            {info.body && <p className="mt-2 text-xs text-gray-600">{snippet(info.body, 120)}</p>}
          </div>
        );
      })()}

      {selectedId && (() => {
        const info = resolveNodeInfo(selectedId);
        return (
          <Card className="absolute bottom-3 right-3 z-20 w-72">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-gray-900">{info.title}</span>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                className="shrink-0 text-gray-400 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge>{KIND_LABELS[info.kind]}</Badge>
              {info.updatedAt && (
                <span className="text-xs text-gray-400">Updated {new Date(info.updatedAt).toLocaleDateString()}</span>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {info.connectionCount} {info.connectionCount === 1 ? "connection" : "connections"}
              {info.connectedTitles.length > 0 && `: ${info.connectedTitles.join(", ")}`}
              {info.hasMoreConnections && ` +${info.connectionCount - info.connectedTitles.length} more`}
            </p>
            {info.body && <p className="mt-2 text-xs text-gray-600">{snippet(info.body, 300)}</p>}
            <Button
              variant="primary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => router.push(`/spaces/${spaceId}/items/${selectedId}`)}
            >
              Open note →
            </Button>
          </Card>
        );
      })()}
    </motion.div>
  );
}
