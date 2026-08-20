"use client";

import { useEffect, useMemo, useRef } from "react";
import { forceCollide, forceX, forceY } from "d3-force";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import type { GraphEdge, GraphNode } from "@/lib/types";
import { RELATIONS } from "@/lib/relations";
import { KIND_COLORS, type GraphTheme } from "@/components/graph/graphTheme";
import type { GraphModel } from "@/components/graph/useGraphModel";

type PositionedNode = NodeObject<GraphNode> & { x?: number; y?: number };
type Box = [number, number, number, number];

/** Zoom below which labels are suppressed entirely and nodes read as plain dots. */
const LOD_HIDE_LABELS = 0.6;
/** Zoom above which every node is labelled rather than just the hubs. */
const LOD_ALL_LABELS = 1.4;
/** Zoom above which edge relation names appear without needing hover. */
const LOD_EDGE_LABELS = 1.6;
/** Zoom above which directional arrowheads are worth drawing. */
const LOD_ARROWS = 0.9;
/** How many hubs stay labelled in the middle zoom band. */
const HUB_LABEL_COUNT = 12;

const DRIFT_FREQ_X = 0.45;
const DRIFT_FREQ_Y = 0.36;
const PULSE_AMPLITUDE = 0.12;
const PULSE_FREQ = 0.6;
const DIMMED_ALPHA = 0.16;
const DIMMED_LINK_ALPHA = 0.12;
/** Outside the focused neighbourhood entirely -- present, but barely. */
const FOCUS_OUT_ALPHA = 0.06;
const FOCUS_OUT_LINK_ALPHA = 0.04;
/** Two hops out: visibly secondary, still readable as context. */
const FOCUS_FAR_ALPHA = 0.55;
const SEARCH_PULSE_FREQ = 2.2;
const LABEL_MAX_CHARS = 24;

export interface GraphCanvasProps {
  graphData: { nodes: GraphNode[]; links: GraphEdge[] };
  model: GraphModel;
  theme: GraphTheme;
  width: number;
  height: number;
  fgRef: React.RefObject<ForceGraphMethods<GraphNode, GraphEdge> | undefined>;
  /** Read every frame by the painters; a ref so mouse-move never re-renders React. */
  hoveredIdRef: React.RefObject<string | null>;
  selectedId: string | null;
  /** Hop distance from the focused node; null when focus mode is off. */
  focusDepth: Map<string, number> | null;
  /** Nodes matching the current search; always labelled and ringed. */
  searchMatches: Set<string>;
  driftAmplitude: number;
  reduceMotion: boolean;
  /** False keeps force-graph repainting after the simulation cools, for idle motion. */
  autoPauseRedraw: boolean;
  onNodeHover: (node: PositionedNode | null) => void;
  onNodeClick: (node: GraphNode) => void;
  onBackgroundClick: () => void;
}

// --- geometry -------------------------------------------------------------
// Edges are quadratic Beziers rather than straight lines: in a dense region a bundle
// of straight segments through the same corridor is impossible to trace by eye,
// whereas gently bowed edges separate visually even when their endpoints nearly
// coincide.

function controlPoint(sx: number, sy: number, ex: number, ey: number, curvature: number) {
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const dx = ex - sx;
  const dy = ey - sy;
  return { cx: mx - dy * curvature, cy: my + dx * curvature };
}

function quadPoint(p0: number, c: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

function quadTangent(p0: number, c: number, p1: number, t: number): number {
  return 2 * (1 - t) * (c - p0) + 2 * t * (p1 - c);
}

function intersects(a: Box, b: Box): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

function truncate(text: string): string {
  return text.length > LABEL_MAX_CHARS ? `${text.slice(0, LABEL_MAX_CHARS - 1)}…` : text;
}

export function GraphCanvas({
  graphData,
  model,
  theme,
  width,
  height,
  fgRef,
  hoveredIdRef,
  selectedId,
  focusDepth,
  searchMatches,
  driftAmplitude,
  reduceMotion,
  autoPauseRedraw,
  onNodeHover,
  onNodeClick,
  onBackgroundClick,
}: GraphCanvasProps) {
  // Label collision state, rebuilt each frame. Node labels are drawn in
  // onRenderFramePost rather than inside nodeCanvasObject so that this component
  // controls their paint order (hubs first, so they win ties) and so every label
  // lands on top of every edge instead of being overdrawn by later-painted links.
  const labelBoxesRef = useRef<Box[]>([]);
  const nodeById = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    for (const node of graphData.nodes) map.set(String(node.id), node as PositionedNode);
    return map;
  }, [graphData]);

  const hubIds = useMemo(
    () => new Set(model.byDegreeDesc.slice(0, HUB_LABEL_COUNT).filter((id) => (model.degree.get(id) ?? 0) > 0)),
    [model]
  );

  function drift(id: string, t: number): { dx: number; dy: number } {
    if (driftAmplitude === 0) return { dx: 0, dy: 0 };
    const phase = model.phase.get(id) ?? 0;
    const variance = 0.8 + (phase / (Math.PI * 2)) * 0.4;
    return {
      dx: Math.sin(t * DRIFT_FREQ_X * variance + phase) * driftAmplitude,
      dy: Math.cos(t * DRIFT_FREQ_Y * variance + phase * 1.7) * driftAmplitude,
    };
  }

  function activeId(): string | null {
    return hoveredIdRef.current ?? selectedId;
  }

  /**
   * Which node drives *de-emphasis*, as opposed to which node is decorated as active.
   *
   * Clicking a node both selects it and focuses on it. If selection kept driving
   * dimming while focused, every node beyond one hop would be pinned at the hover
   * dim level, and the 1/2/All depth control would change the breadcrumb count while
   * changing almost nothing on screen -- the two systems would be fighting for the
   * same pixels. While focus is active it owns the dimming, and only a live hover
   * narrows things further.
   */
  function dimmingId(): string | null {
    return focusDepth ? hoveredIdRef.current : activeId();
  }

  function radiusOf(id: string): number {
    return model.radius.get(id) ?? 4;
  }

  /**
   * How strongly a node is drawn, combining the two independent de-emphasis systems.
   *
   * Focus mode is the outer filter (is this node in the neighbourhood at all), and
   * hover/selection is the inner one (is it the thing being pointed at). They compose
   * by taking the lower value, so hovering inside a focused subgraph dims the rest of
   * that subgraph without ever brightening something focus had already pushed away.
   */
  function nodeEmphasis(id: string): number {
    let alpha = 1;
    if (focusDepth) {
      const d = focusDepth.get(id);
      if (d === undefined) alpha = FOCUS_OUT_ALPHA;
      else if (d >= 2) alpha = FOCUS_FAR_ALPHA;
    }
    const dimId = dimmingId();
    if (dimId !== null) {
      const isActive = dimId === id;
      const isNeighbor = !isActive && (model.adjacency.get(dimId)?.has(id) ?? false);
      if (!isActive && !isNeighbor) alpha = Math.min(alpha, DIMMED_ALPHA);
    }
    return alpha;
  }

  function edgeEmphasis(sourceId: string, targetId: string, active: boolean): number {
    let alpha = active ? 1 : 0.55;
    if (focusDepth && !(focusDepth.has(sourceId) && focusDepth.has(targetId))) {
      alpha = Math.min(alpha, FOCUS_OUT_LINK_ALPHA);
    }
    if (dimmingId() !== null && !active) alpha = Math.min(alpha, DIMMED_LINK_ALPHA);
    return alpha;
  }

  /** A node keeps its label regardless of zoom when it is being engaged with. */
  function isForced(id: string): boolean {
    if (searchMatches.has(id)) return true;
    const highlightId = activeId();
    if (highlightId !== null && (highlightId === id || (model.adjacency.get(highlightId)?.has(id) ?? false))) {
      return true;
    }
    // Inside a focused neighbourhood every remaining node is, by definition, what the
    // user asked to look at -- so they are all labelled regardless of zoom.
    return focusDepth?.has(id) ?? false;
  }

  // --- physics ------------------------------------------------------------
  // Previously the graph ran entirely on d3-force defaults: charge -30, link distance
  // 30, and -- critically -- NO collision force registered at all, which is why nodes
  // could and did overlap. These are set imperatively after mount because force-graph
  // exposes the live d3 forces rather than accepting them as props.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const n = graphData.nodes.length;
    if (n === 0) return;

    const charge = fg.d3Force("charge") as
      | { strength: (v: number) => unknown; distanceMax: (v: number) => unknown }
      | undefined;
    if (charge) {
      // Scaling repulsion with node count keeps density roughly constant instead of
      // letting big graphs collapse into a single dense knot. distanceMax bounds the
      // far-field term, which both cuts O(n^2) work and stops distant clusters from
      // dragging on each other.
      charge.strength(-180 - Math.min(n, 400) * 0.8);
      charge.distanceMax(600);
    }

    const link = fg.d3Force("link") as
      | {
          distance: (fn: (l: unknown) => number) => unknown;
          strength: (fn: (l: unknown) => number) => unknown;
        }
      | undefined;
    if (link) {
      const endpointDegree = (endpoint: unknown): number => {
        const id =
          typeof endpoint === "object" && endpoint !== null
            ? String((endpoint as { id?: unknown }).id)
            : String(endpoint);
        return model.degree.get(id) ?? 0;
      };
      // Longer edges between well-connected nodes give hubs room to breathe; weaker
      // springs on high-degree endpoints stop a hub from reeling its neighbours into
      // an unreadable rosette.
      link.distance((l) => {
        const raw = l as { source?: unknown; target?: unknown };
        return 60 + 12 * Math.min(endpointDegree(raw.source) + endpointDegree(raw.target), 12);
      });
      link.strength((l) => {
        const raw = l as { source?: unknown; target?: unknown };
        return 1 / (1 + Math.min(endpointDegree(raw.source), endpointDegree(raw.target)));
      });
    }

    // The +14 gutter is what makes labels placeable: without headroom around each
    // node, every label would collide with a neighbour and be dropped.
    fg.d3Force(
      "collide",
      forceCollide<PositionedNode>((node) => radiusOf(String(node.id)) + 14).iterations(2) as never
    );

    // forceCenter yanks the whole graph so its centroid sits exactly at the origin,
    // which fights the user whenever they pan. Weak positional forces pull toward the
    // origin instead, and the slightly stronger y term biases the layout wider than it
    // is tall -- matching the shape of the viewport it has to fit into.
    fg.d3Force("center", null as never);
    fg.d3Force("x", forceX<PositionedNode>(0).strength(0.03) as never);
    fg.d3Force("y", forceY<PositionedNode>(0).strength(0.04) as never);

    fg.d3ReheatSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fgRef, graphData, model]);

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={graphData}
      nodeId="id"
      width={width}
      height={height}
      autoPauseRedraw={autoPauseRedraw}
      d3VelocityDecay={0.28}
      cooldownTicks={200}
      warmupTicks={graphData.nodes.length > 150 ? 80 : 0}
      // Arriving pre-framed rather than at d3's arbitrary default zoom; there was no
      // zoomToFit anywhere before, which is part of why the initial view felt random.
      onEngineStop={() => fgRef.current?.zoomToFit(600, 80)}
      onNodeHover={(node) => onNodeHover((node as PositionedNode | null) ?? null)}
      onNodeClick={(node) => onNodeClick(node as GraphNode)}
      onBackgroundClick={onBackgroundClick}
      // Hit-testing runs on an offscreen canvas force-graph only repaints on an
      // internal 800ms throttle. Painting the hit area at the node's stable base
      // position, inflated to cover the whole drift envelope, keeps hover from going
      // stale between those repaints as the node floats away from where it was.
      nodePointerAreaPaint={(node, color, ctx) => {
        const n = node as PositionedNode;
        if (n.x === undefined || n.y === undefined) return;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radiusOf(String(n.id)) + driftAmplitude + 4, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }}
      onRenderFramePre={() => {
        labelBoxesRef.current = [];
      }}
      // Edges are drawn by hand (rather than via linkColor/linkWidth) because
      // force-graph's own link renderer reads the raw, undrifted endpoint positions --
      // so lines would visibly detach from nodes painted at a drifted offset.
      linkCanvasObjectMode={() => "replace"}
      linkCanvasObject={(link, ctx, globalScale) => {
        const raw = link as {
          id?: unknown;
          source?: unknown;
          target?: unknown;
          relation?: GraphEdge["relation"];
          directed?: boolean;
        };
        const source = raw.source;
        const target = raw.target;
        if (typeof source !== "object" || source === null || typeof target !== "object" || target === null) return;
        const s = source as PositionedNode;
        const e = target as PositionedNode;
        if (s.x === undefined || s.y === undefined || e.x === undefined || e.y === undefined) return;

        const t = performance.now() / 1000;
        const sd = drift(String(s.id), t);
        const ed = drift(String(e.id), t);
        const sx = s.x + sd.dx;
        const sy = s.y + sd.dy;
        const ex = e.x + ed.dx;
        const ey = e.y + ed.dy;

        const highlightId = activeId();
        const active = highlightId !== null && (String(s.id) === highlightId || String(e.id) === highlightId);
        const alpha = edgeEmphasis(String(s.id), String(e.id), active);
        // "Dimmed" now means "faded far enough that detail is noise", whether that came
        // from hover de-emphasis or from falling outside the focused neighbourhood.
        const dimmed = alpha <= DIMMED_LINK_ALPHA;

        const relation = raw.relation ?? "related";
        const meta = RELATIONS[relation];
        const curvature = model.curvature.get(String(raw.id)) ?? 0;
        const { cx, cy } = controlPoint(sx, sy, ex, ey, curvature);

        ctx.save();
        ctx.globalAlpha = alpha;
        // Widths and dash lengths are divided by globalScale so they stay constant in
        // screen pixels: a fixed graph-space width would vanish when zoomed out and
        // turn into a slab when zoomed in.
        ctx.lineWidth = (active ? 2.2 : 0.9) / globalScale;
        ctx.strokeStyle = active ? theme.linkActive : meta.color;
        if (meta.dash) ctx.setLineDash(meta.dash.map((d) => d / globalScale));
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        const directed = raw.directed ?? false;
        if (directed && globalScale > LOD_ARROWS && !dimmed) {
          const targetR = radiusOf(String(e.id));
          const chord = Math.hypot(ex - sx, ey - sy) || 1;
          const tArrow = Math.max(0, Math.min(1, 1 - (targetR + 3) / chord));
          const ax = quadPoint(sx, cx, ex, tArrow);
          const ay = quadPoint(sy, cy, ey, tArrow);
          const angle = Math.atan2(quadTangent(sy, cy, ey, tArrow), quadTangent(sx, cx, ex, tArrow));
          const size = (active ? 8 : 6) / globalScale;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - size * Math.cos(angle - Math.PI / 7), ay - size * Math.sin(angle - Math.PI / 7));
          ctx.lineTo(ax - size * Math.cos(angle + Math.PI / 7), ay - size * Math.sin(angle + Math.PI / 7));
          ctx.closePath();
          ctx.fillStyle = active ? theme.linkActive : meta.color;
          ctx.fill();
        }

        // Particles now animate only on edges touching the active node. Previously
        // every edge carried a perpetually travelling dot, which on a busy graph read
        // as static noise and forced a full repaint every frame for no information.
        if (active && !reduceMotion) {
          const progress = (t * 0.48) % 1;
          ctx.beginPath();
          ctx.arc(
            quadPoint(sx, cx, ex, progress),
            quadPoint(sy, cy, ey, progress),
            2.4 / globalScale,
            0,
            2 * Math.PI
          );
          ctx.fillStyle = theme.linkActive;
          ctx.fill();
        }

        // Edge labels: on demand when the edge is active, automatically once zoomed in
        // far enough that there is room for them.
        const showLabel = relation !== "related" && (active || globalScale >= LOD_EDGE_LABELS);
        if (showLabel && !dimmed) {
          const mx = quadPoint(sx, cx, ex, 0.5);
          const my = quadPoint(sy, cy, ey, 0.5);
          const fontSize = 9 / globalScale;
          ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
          const text = meta.label;
          const w = ctx.measureText(text).width;
          const padX = 3 / globalScale;
          const padY = 2 / globalScale;
          const box: Box = [
            mx - w / 2 - padX,
            my - fontSize / 2 - padY,
            mx + w / 2 + padX,
            my + fontSize / 2 + padY,
          ];
          if (!labelBoxesRef.current.some((b) => intersects(b, box))) {
            labelBoxesRef.current.push(box);
            let angle = Math.atan2(quadTangent(sy, cy, ey, 0.5), quadTangent(sx, cx, ex, 0.5));
            // Keep text upright: without this, any edge running right-to-left renders
            // its label upside down.
            if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
            ctx.translate(mx, my);
            ctx.rotate(angle);
            ctx.fillStyle = theme.labelBg;
            ctx.fillRect(-w / 2 - padX, -fontSize / 2 - padY, w + padX * 2, fontSize + padY * 2);
            ctx.fillStyle = meta.color;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, 0, 0);
          }
        }
        ctx.restore();
      }}
      nodeCanvasObject={(node, ctx) => {
        const n = node as PositionedNode;
        if (n.x === undefined || n.y === undefined) return;
        const id = String(n.id);

        const highlightId = activeId();
        const isActive = highlightId === id;
        const isNeighbor = highlightId !== null && !isActive && (model.adjacency.get(highlightId)?.has(id) ?? false);
        const isMatch = searchMatches.has(id);
        const alpha = nodeEmphasis(id);

        const t = performance.now() / 1000;
        const { dx, dy } = drift(id, t);
        const drawX = n.x + dx;
        const drawY = n.y + dy;

        // The pulse is now reserved for the node the user is actually engaging with.
        // Applied to every node at once (as before) it made a large graph shimmer.
        // Search matches pulse faster than the selection does, so a match reads as
        // "found this for you" rather than "you are pointing at this".
        const pulse = reduceMotion
          ? 0
          : isMatch
            ? Math.sin(t * SEARCH_PULSE_FREQ) * PULSE_AMPLITUDE * 1.5
            : isActive
              ? Math.sin(t * PULSE_FREQ + (model.phase.get(id) ?? 0) * 2.3) * PULSE_AMPLITUDE
              : 0;
        const base = radiusOf(id) * (isActive ? 1.25 : 1);
        const radius = base * (1 + pulse);

        ctx.save();
        // A search match is never dimmed away -- the whole point of searching is to
        // find something that may well be outside the current focus.
        ctx.globalAlpha = isMatch ? 1 : alpha;

        const kindColor = KIND_COLORS[n.kind];
        ctx.beginPath();
        ctx.arc(drawX, drawY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = kindColor;
        ctx.fill();

        // A soft off-centre sheen laid over the flat fill, rather than a white-cored
        // gradient: interpolating all the way to #ffffff turned every node into a
        // glossy marble that read as decoration instead of data. Capping the highlight
        // at 40% white keeps the node reading as a solid, saturated dot that happens
        // to catch the light -- consistent with the frosted surfaces around it.
        const sheen = ctx.createRadialGradient(
          drawX - radius * 0.35,
          drawY - radius * 0.4,
          0,
          drawX - radius * 0.35,
          drawY - radius * 0.4,
          radius * 1.1
        );
        sheen.addColorStop(0, "rgba(255, 255, 255, 0.4)");
        sheen.addColorStop(0.55, "rgba(255, 255, 255, 0.06)");
        sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = sheen;
        ctx.fill();

        ctx.lineWidth = 1;
        ctx.strokeStyle = theme.nodeRim;
        ctx.stroke();

        if (isMatch) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, radius + 4, 0, 2 * Math.PI);
          ctx.lineWidth = 2;
          ctx.strokeStyle = theme.searchRing;
          ctx.stroke();
        }

        if (isActive) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, radius + 2.5, 0, 2 * Math.PI);
          ctx.lineWidth = 1.75;
          ctx.strokeStyle = theme.highlightRing;
          ctx.stroke();
        } else if (isNeighbor) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, radius + 1.5, 0, 2 * Math.PI);
          ctx.lineWidth = 1.25;
          ctx.strokeStyle = theme.neighborRing;
          ctx.stroke();
        }
        ctx.restore();
      }}
      // Node labels are painted last, over everything, in degree order. This is the
      // single biggest legibility change: before this the graph rendered no labels at
      // all, so a node's identity could only be discovered by hovering it one at a
      // time.
      onRenderFramePost={(ctx, globalScale) => {
        if (globalScale < LOD_HIDE_LABELS) return;
        const showAll = globalScale >= LOD_ALL_LABELS;
        const highlightId = activeId();
        const t = performance.now() / 1000;
        const fontSize = 11 / globalScale;
        ctx.save();
        ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (const id of model.byDegreeDesc) {
          const node = nodeById.get(id);
          if (!node || node.x === undefined || node.y === undefined) continue;

          const isActive = highlightId === id;
          // Anything the user is engaging with -- pointed at, adjacent to, or found by
          // search -- keeps its label regardless of zoom; otherwise the middle band
          // shows hubs only, which is what keeps a dense graph from becoming a wall of
          // text.
          const forced = isForced(id);
          if (dimmingId() !== null && !forced) continue;
          if (!forced && !showAll && !hubIds.has(id)) continue;
          // Labels inherit the node's emphasis: a name floating at full strength over
          // a node faded to 6% reads as a rendering bug rather than as context.
          const alpha = searchMatches.has(id) ? 1 : nodeEmphasis(id);
          if (alpha <= FOCUS_OUT_ALPHA) continue;

          const { dx, dy } = drift(id, t);
          const r = radiusOf(id);
          const cx = node.x + dx;
          const cy = node.y + dy + r + fontSize * 0.9;

          const text = truncate(model.titleById.get(id) ?? "Untitled");
          const w = ctx.measureText(text).width;
          const padX = 4 / globalScale;
          const padY = 2.5 / globalScale;
          const box: Box = [
            cx - w / 2 - padX,
            cy - fontSize / 2 - padY,
            cx + w / 2 + padX,
            cy + fontSize / 2 + padY,
          ];
          // First-come-wins, and the iteration order is degree-descending, so when two
          // labels compete the better-connected node keeps its name.
          if (!forced && labelBoxesRef.current.some((b) => intersects(b, box))) continue;
          labelBoxesRef.current.push(box);

          ctx.beginPath();
          ctx.roundRect(box[0], box[1], box[2] - box[0], box[3] - box[1], 3 / globalScale);
          ctx.fillStyle = theme.labelBg;
          ctx.fill();
          ctx.lineWidth = 0.5 / globalScale;
          ctx.strokeStyle = theme.labelBorder;
          ctx.stroke();

          ctx.globalAlpha = alpha;
          ctx.fillStyle = isActive || searchMatches.has(id) ? theme.labelText : theme.labelTextMuted;
          ctx.fillText(text, cx, cy);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }}
    />
  );
}
