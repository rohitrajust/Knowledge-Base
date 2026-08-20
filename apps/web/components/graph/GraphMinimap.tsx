"use client";

import { useEffect, useRef } from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import type { GraphEdge, GraphNode } from "@/lib/types";
import { KIND_COLORS } from "@/components/graph/graphTheme";
import { GlassPanel } from "@/components/ui/GlassPanel";

const WIDTH = 168;
const HEIGHT = 112;
const PADDING = 6;
/**
 * Repaint interval. A minimap conveys "roughly where am I", which does not improve at
 * 60fps -- and repainting it per frame would double the canvas work of the whole page
 * for no readable difference.
 */
const FRAME_MS = 125;

type PositionedNode = GraphNode & { x?: number; y?: number };

/**
 * Overview of the whole graph with the current viewport drawn on it, and click/drag
 * to pan there.
 *
 * Needed precisely because the main canvas is now full-bleed and zoomable: once the
 * view can be zoomed into a corner of a large graph, nothing else on screen tells you
 * how much graph is off-screen or in which direction.
 */
export function GraphMinimap({
  nodes,
  fgRef,
  viewWidth,
  viewHeight,
}: {
  nodes: PositionedNode[];
  fgRef: React.RefObject<ForceGraphMethods<GraphNode, GraphEdge> | undefined>;
  /** Size of the main canvas, passed in rather than queried from the DOM: a
   *  `document.querySelector("canvas")` would match whichever canvas happens to come
   *  first, and this component renders one of its own. */
  viewWidth: number;
  viewHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mirrored into a ref so the paint loop can read the latest nodes without being
  // torn down and re-subscribed every time the data changes. Synced in an effect
  // rather than assigned during render, which would be a render-phase side effect.
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const boundsRef = useRef<{ minX: number; minY: number; scale: number } | null>(null);
  const viewRef = useRef({ w: viewWidth, h: viewHeight });
  useEffect(() => {
    viewRef.current = { w: viewWidth, h: viewHeight };
  }, [viewWidth, viewHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    let rafId: number;
    let last = 0;

    const paint = (now: number) => {
      rafId = requestAnimationFrame(paint);
      if (now - last < FRAME_MS) return;
      last = now;

      const list = nodesRef.current.filter((n) => n.x !== undefined && n.y !== undefined);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      if (list.length === 0) {
        boundsRef.current = null;
        return;
      }

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const n of list) {
        if (n.x! < minX) minX = n.x!;
        if (n.x! > maxX) maxX = n.x!;
        if (n.y! < minY) minY = n.y!;
        if (n.y! > maxY) maxY = n.y!;
      }
      const spanX = Math.max(maxX - minX, 1);
      const spanY = Math.max(maxY - minY, 1);
      const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY);
      // Centre the scaled extent so a tall or wide graph is not pinned to a corner.
      const offX = PADDING + (WIDTH - PADDING * 2 - spanX * scale) / 2;
      const offY = PADDING + (HEIGHT - PADDING * 2 - spanY * scale) / 2;
      boundsRef.current = { minX: minX - offX / scale, minY: minY - offY / scale, scale };

      const toMap = (x: number, y: number) => ({
        mx: (x - minX) * scale + offX,
        my: (y - minY) * scale + offY,
      });

      for (const n of list) {
        const { mx, my } = toMap(n.x!, n.y!);
        ctx.beginPath();
        ctx.arc(mx, my, 1.6, 0, 2 * Math.PI);
        ctx.fillStyle = KIND_COLORS[n.kind];
        ctx.globalAlpha = 0.8;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Viewport rectangle, derived from the main canvas's own pan/zoom transform so
      // it cannot drift out of agreement with what is actually on screen.
      const fg = fgRef.current;
      if (fg) {
        try {
          const { w, h } = viewRef.current;
          if (w > 0 && h > 0) {
            const tl = fg.screen2GraphCoords(0, 0);
            const br = fg.screen2GraphCoords(w, h);
            const a = toMap(tl.x, tl.y);
            const b = toMap(br.x, br.y);
            ctx.beginPath();
            ctx.rect(a.mx, a.my, b.mx - a.mx, b.my - a.my);
            ctx.strokeStyle = "rgba(4, 92, 97, 0.9)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = "rgba(4, 92, 97, 0.08)";
            ctx.fill();
          }
        } catch {
          // screen2GraphCoords throws before the canvas has mounted its transform.
        }
      }
    };

    rafId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafId);
  }, [fgRef]);

  function navigate(event: React.MouseEvent<HTMLCanvasElement>) {
    const bounds = boundsRef.current;
    const fg = fgRef.current;
    const canvas = canvasRef.current;
    if (!bounds || !fg || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    fg.centerAt(bounds.minX + px / bounds.scale, bounds.minY + py / bounds.scale, 400);
  }

  return (
    <GlassPanel className="overflow-hidden p-1.5">
      <canvas
        ref={canvasRef}
        style={{ width: WIDTH, height: HEIGHT }}
        onClick={navigate}
        onMouseMove={(event) => {
          if (event.buttons === 1) navigate(event);
        }}
        aria-label="Graph minimap"
        className="block cursor-crosshair rounded-lg"
      />
    </GlassPanel>
  );
}
