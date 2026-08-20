"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import type { GraphNode, GraphEdge, Item } from "@/lib/types";
import { motionTokens } from "@/lib/motionTokens";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeTooltip } from "@/components/graph/NodeTooltip";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";
import { readGraphTheme, type GraphTheme } from "@/components/graph/graphTheme";
import { driftAmplitudeFor, useGraphModel } from "@/components/graph/useGraphModel";
import { resolveNodeInfo } from "@/components/graph/nodeInfo";

type PositionedNode = NodeObject<GraphNode> & { x?: number; y?: number };

const TOOLTIP_WIDTH = 272;
const TOOLTIP_HEIGHT = 170;

/**
 * Orchestrates the graph: owns interaction state and layout, and delegates all
 * painting to GraphCanvas.
 *
 * This component is still the target of GraphView's `next/dynamic({ ssr: false })`
 * import, which must not change -- react-force-graph-2d touches `window` at module
 * load time and is not SSR-safe.
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

  // The tooltip and the detail panel are genuinely React-rendered, and only change on
  // hover-target/click rather than per frame, so these two do belong in state.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Canvas colours come from the same CSS custom properties as the rest of the app.
  // A lazy initialiser rather than an effect: this component is only ever reached
  // through GraphView's `ssr: false` dynamic import, so first render already has a
  // live document for getComputedStyle -- and reading it here avoids a redundant
  // render pass (plus the cascading-render this would otherwise trigger in an effect).
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

  const model = useGraphModel(nodes, edges);
  const driftAmplitude = reduceMotion ? 0 : driftAmplitudeFor(nodes.length);

  // force-graph re-heats the whole simulation AND wipes its hit-test colour registry
  // whenever it receives node/link objects it has not seen before -- which a fresh
  // `{ ...node }` copy always is, even when the underlying data is identical. Building
  // this inline in JSX meant every hover silently restarted the physics and
  // reassigned hit-test colours, which is why nodes never settled and clicks
  // intermittently missed. Memoising on [nodes, edges] preserves object identity
  // across renders that do not change the data.
  //
  // Nodes are ordered by degree so that hub labels are placed first and therefore win
  // collisions against less-connected neighbours.
  const graphData = useMemo(() => {
    const order = new Map(model.byDegreeDesc.map((id, i) => [id, i]));
    return {
      nodes: [...nodes]
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .map((node) => ({ ...node })),
      links: edges.map((edge) => ({ ...edge })),
    };
  }, [nodes, edges, model]);

  // Keeps the tooltip glued to its node's actual (drifting) screen position every
  // frame without a React re-render: it recomputes the same drift offset the canvas
  // painter uses and converts to screen pixels via force-graph's pan/zoom-aware
  // transform.
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

  // Esc clears the selection, matching the existing background-click behaviour.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  // force-graph's redraw gate is `!autoPauseRedraw || needsRedraw || isEngineRunning()`,
  // so `autoPauseRedraw={true}` *pauses* repainting once the engine settles. The
  // previous value (`!prefersReducedMotion`) was therefore inverted: for every user
  // who had NOT asked for reduced motion it froze the canvas, silently disabling the
  // drift, pulse and particle animation the whole file exists to draw.
  //
  // Rather than simply flipping it, repainting is now tied to whether anything is
  // actually animating -- idle drift, or an active node with a travelling particle.
  // A settled graph with nothing hovered stops burning frames entirely.
  const animating = !reduceMotion && (driftAmplitude > 0 || hoveredNodeId !== null || selectedId !== null);

  const hoveredInfo = hoveredNodeId ? resolveNodeInfo(hoveredNodeId, model, itemsById) : null;
  const selectedInfo = selectedId ? resolveNodeInfo(selectedId, model, itemsById) : null;

  return (
    <motion.div
      ref={containerRef}
      initial={reduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth }}
      className="relative h-full w-full overflow-hidden"
    >
      {theme && dimensions.width > 0 && (
        <GraphCanvas
          graphData={graphData}
          model={model}
          theme={theme}
          width={dimensions.width}
          height={dimensions.height}
          fgRef={fgRef}
          hoveredIdRef={hoveredIdRef}
          selectedId={selectedId}
          driftAmplitude={driftAmplitude}
          reduceMotion={reduceMotion}
          autoPauseRedraw={!animating}
          onNodeHover={(node) => {
            hoveredIdRef.current = node ? String(node.id) : null;
            hoveredBaseRef.current = node ? { id: String(node.id), node } : null;
            setHoveredNodeId(node ? String(node.id) : null);
          }}
          onNodeClick={(node) => setSelectedId(String(node.id))}
          onBackgroundClick={() => setSelectedId(null)}
        />
      )}

      {hoveredInfo && hoveredNodeId !== selectedId && <NodeTooltip ref={tooltipRef} info={hoveredInfo} />}

      {selectedInfo && (
        <NodeDetailPanel
          info={selectedInfo}
          spaceId={spaceId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </motion.div>
  );
}
