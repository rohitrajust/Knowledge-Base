"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import type { GraphNode, GraphEdge, Item } from "@/lib/types";
import { motionTokens } from "@/lib/motionTokens";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { GraphToolbar } from "@/components/graph/GraphToolbar";
import { GraphFilterPanel, DEFAULT_FILTERS, type GraphFilters } from "@/components/graph/GraphFilterPanel";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { FocusBreadcrumb, type FocusDepth } from "@/components/graph/FocusBreadcrumb";
import { NodeTooltip } from "@/components/graph/NodeTooltip";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";
import { readGraphTheme, type GraphTheme } from "@/components/graph/graphTheme";
import { bfsDepth, driftAmplitudeFor, useGraphModel } from "@/components/graph/useGraphModel";
import { resolveNodeInfo } from "@/components/graph/nodeInfo";
import { EmptyState } from "@/components/ui/EmptyState";

type PositionedNode = NodeObject<GraphNode> & { x?: number; y?: number };

const TOOLTIP_WIDTH = 272;
const TOOLTIP_HEIGHT = 170;
const SEARCH_DEBOUNCE_MS = 180;

/**
 * Orchestrates the graph: owns filtering, search, focus and interaction state, and
 * delegates painting to GraphCanvas.
 *
 * Still the target of GraphView's `next/dynamic({ ssr: false })` import, which must
 * not change -- react-force-graph-2d touches `window` at module load and is not
 * SSR-safe.
 */
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
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphEdge> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  // Hover state used by the canvas render loop lives in a ref, not React state: the
  // painters are called by force-graph's own loop every frame, so a ref is enough --
  // routing hover through setState there would rebuild `graphData` on every
  // mouse-move, which force-graph treats as brand-new data (see the memo below).
  const hoveredIdRef = useRef<string | null>(null);
  // Holds the live node object, mutated in place by the physics engine, rather than a
  // frozen {x,y} snapshot -- a snapshot taken at hover-start drifts away from the
  // node's drawn position as soon as the simulation nudges it again, detaching the
  // tooltip from the node it is supposed to be glued to.
  const hoveredBaseRef = useRef<{ id: string; node: PositionedNode } | null>(null);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusDepthLevel, setFocusDepthLevel] = useState<FocusDepth>(1);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Canvas colours come from the same CSS custom properties as the rest of the app.
  // A lazy initialiser rather than an effect: this component is only ever reached
  // through GraphView's `ssr: false` dynamic import, so first render already has a
  // live document for getComputedStyle.
  const [theme] = useState<GraphTheme | null>(() => readGraphTheme());

  // ForceGraph2D defaults width/height to the window size rather than measuring its
  // container, so without this the canvas is sized to the whole viewport while only a
  // cropped portion is visible -- putting the graph's true centre outside the crop and
  // bunching nodes against one edge.
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

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // --- filtering ----------------------------------------------------------
  // Applied in dependency order: kinds gate nodes, relations gate edges, and only
  // then can a connection count be computed -- so the minimum-connections and
  // hide-unconnected controls act on what is actually still on screen rather than on
  // the unfiltered graph.
  const filtered = useMemo(() => {
    const kindOk = nodes.filter((n) => filters.kinds.has(n.kind));
    let visibleIds = new Set(kindOk.map((n) => n.id));
    let visibleEdges = edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target) && filters.relations.has(e.relation)
    );

    const minDegree = Math.max(filters.minConnections, filters.hideOrphans ? 1 : 0);
    let visibleNodes = kindOk;
    if (minDegree > 0) {
      const degree = new Map<string, number>();
      for (const e of visibleEdges) {
        degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
        degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      }
      visibleNodes = kindOk.filter((n) => (degree.get(n.id) ?? 0) >= minDegree);
      visibleIds = new Set(visibleNodes.map((n) => n.id));
      visibleEdges = visibleEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    }

    return { nodes: visibleNodes, edges: visibleEdges };
  }, [nodes, edges, filters]);

  const model = useGraphModel(filtered.nodes, filtered.edges);
  const driftAmplitude = reduceMotion ? 0 : driftAmplitudeFor(filtered.nodes.length);

  // force-graph re-heats the whole simulation AND wipes its hit-test colour registry
  // whenever it receives node/link objects it has not seen before -- which a fresh
  // `{ ...node }` copy always is, even when the underlying data is identical. Building
  // this inline in JSX meant every hover silently restarted the physics and
  // reassigned hit-test colours, which is why nodes never settled and clicks
  // intermittently missed.
  //
  // Nodes are ordered by degree so hub labels are placed first and win collisions.
  const graphData = useMemo(() => {
    const order = new Map(model.byDegreeDesc.map((id, i) => [id, i]));
    return {
      nodes: [...filtered.nodes]
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .map((node) => ({ ...node })),
      links: filtered.edges.map((edge) => ({ ...edge })),
    };
  }, [filtered, model]);

  const searchMatches = useMemo(() => {
    if (!debouncedQuery) return new Set<string>();
    const needle = debouncedQuery.toLowerCase();
    return new Set(
      filtered.nodes.filter((n) => n.title.toLowerCase().includes(needle)).map((n) => n.id)
    );
  }, [debouncedQuery, filtered.nodes]);

  // Depth 0 in the UI means "all", which is expressed as a BFS bounded by the node
  // count -- every reachable node then lands in the map and nothing is dimmed out.
  const focusDepth = useMemo(() => {
    if (!focusId || !model.adjacency.has(focusId)) return null;
    const max = focusDepthLevel === 0 ? filtered.nodes.length : focusDepthLevel;
    return bfsDepth(model.adjacency, focusId, max);
  }, [focusId, focusDepthLevel, model, filtered.nodes.length]);

  // --- view controls ------------------------------------------------------
  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoom(fg.zoom() * factor, 300);
  }, []);

  const fit = useCallback(() => fgRef.current?.zoomToFit(500, 80), []);

  const resetView = useCallback(() => {
    setFocusId(null);
    setSelectedId(null);
    setQuery("");
    setFilters({ ...DEFAULT_FILTERS, kinds: new Set(DEFAULT_FILTERS.kinds), relations: new Set(DEFAULT_FILTERS.relations) });
    fgRef.current?.zoomToFit(500, 80);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const centerOnFirstMatch = useCallback(() => {
    const fg = fgRef.current;
    if (!fg || searchMatches.size === 0) return;
    const first = graphData.nodes.find((n) => searchMatches.has(n.id)) as PositionedNode | undefined;
    if (!first || first.x === undefined || first.y === undefined) return;
    fg.centerAt(first.x, first.y, 600);
    fg.zoom(Math.max(fg.zoom(), 2.2), 600);
  }, [graphData, searchMatches]);

  // Keeps the tooltip glued to its node's actual (drifting) screen position every
  // frame without a React re-render.
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
        let dx = 0;
        let dy = 0;
        if (driftAmplitude > 0) {
          const phase = model.phase.get(base.id) ?? 0;
          const variance = 0.8 + (phase / (Math.PI * 2)) * 0.4;
          dx = Math.sin(t * 0.45 * variance + phase) * driftAmplitude;
          dy = Math.cos(t * 0.36 * variance + phase * 1.7) * driftAmplitude;
        }
        const screen = fg.graph2ScreenCoords(base.node.x + dx, base.node.y + dy);
        const maxLeft = Math.max(8, container.clientWidth - TOOLTIP_WIDTH);
        const maxTop = Math.max(8, container.clientHeight - TOOLTIP_HEIGHT);
        const left = Math.min(Math.max(screen.x + 14, 8), maxLeft);
        const top = Math.min(Math.max(screen.y - 14, 8), maxTop);
        tooltip.style.transform = `translate(${left}px, ${top}px)`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [hoveredNodeId, driftAmplitude, model]);

  // Esc unwinds one layer at a time -- focus first, then selection -- so it never
  // discards more context than the user asked it to.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (focusId) setFocusId(null);
      else if (selectedId) setSelectedId(null);
      else if (query) setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, selectedId, query]);

  // force-graph's redraw gate is `!autoPauseRedraw || needsRedraw || isEngineRunning()`,
  // so `autoPauseRedraw={true}` *pauses* repainting once the engine settles. The
  // previous value (`!prefersReducedMotion`) was inverted: for every user who had NOT
  // asked for reduced motion it froze the canvas, silently disabling the animation the
  // file exists to draw. Repainting is now tied to whether anything is actually
  // animating, so a settled graph with nothing hovered stops burning frames.
  const animating =
    !reduceMotion &&
    (driftAmplitude > 0 || hoveredNodeId !== null || selectedId !== null || searchMatches.size > 0);

  const hoveredInfo = hoveredNodeId ? resolveNodeInfo(hoveredNodeId, model, itemsById) : null;
  const selectedInfo = selectedId ? resolveNodeInfo(selectedId, model, itemsById) : null;
  const focusTitle = focusId ? (model.titleById.get(focusId) ?? "Untitled") : "";

  return (
    <motion.div
      ref={containerRef}
      initial={reduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth }}
      className="relative h-full w-full overflow-hidden bg-transparent"
    >
      {theme && dimensions.width > 0 && filtered.nodes.length > 0 && (
        <GraphCanvas
          graphData={graphData}
          model={model}
          theme={theme}
          width={dimensions.width}
          height={dimensions.height}
          fgRef={fgRef}
          hoveredIdRef={hoveredIdRef}
          selectedId={selectedId}
          focusDepth={focusDepth}
          searchMatches={searchMatches}
          driftAmplitude={driftAmplitude}
          reduceMotion={reduceMotion}
          autoPauseRedraw={!animating}
          onNodeHover={(node) => {
            hoveredIdRef.current = node ? String(node.id) : null;
            hoveredBaseRef.current = node ? { id: String(node.id), node } : null;
            setHoveredNodeId(node ? String(node.id) : null);
          }}
          onNodeClick={(node) => {
            const id = String(node.id);
            setSelectedId(id);
            setFocusId(id);
          }}
          onBackgroundClick={() => {
            setSelectedId(null);
            setFocusId(null);
          }}
        />
      )}

      {filtered.nodes.length === 0 && (
        <div className="flex h-full items-center justify-center p-8">
          <EmptyState variant="block" className="max-w-sm">
            No items match these filters.
          </EmptyState>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute top-4 left-4">
          <GraphToolbar
            spaceId={spaceId}
            query={query}
            onQueryChange={setQuery}
            matchCount={debouncedQuery ? searchMatches.size : null}
            onSubmitSearch={centerOnFirstMatch}
            onZoomIn={() => zoomBy(1.4)}
            onZoomOut={() => zoomBy(1 / 1.4)}
            onFit={fit}
            onReset={resetView}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
          />
        </div>

        <div className="pointer-events-auto absolute top-4 right-4">
          <GraphFilterPanel
            filters={filters}
            onChange={setFilters}
            counts={{ nodes: filtered.nodes.length, edges: filtered.edges.length, total: nodes.length }}
          />
        </div>

        {focusId && (
          <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2">
            <FocusBreadcrumb
              title={focusTitle}
              depth={focusDepthLevel}
              onDepthChange={setFocusDepthLevel}
              visibleCount={focusDepth?.size ?? 0}
              onClear={() => setFocusId(null)}
            />
          </div>
        )}

        <div className="pointer-events-auto absolute bottom-4 left-4 flex flex-col gap-2">
          <GraphLegend />
        </div>
      </div>

      {hoveredInfo && hoveredNodeId !== selectedId && <NodeTooltip ref={tooltipRef} info={hoveredInfo} />}

      {selectedInfo && (
        <NodeDetailPanel info={selectedInfo} spaceId={spaceId} onClose={() => setSelectedId(null)} />
      )}
    </motion.div>
  );
}
