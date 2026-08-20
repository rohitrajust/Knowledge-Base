"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { RELATIONS, RELATION_ORDER } from "@/lib/relations";
import { ALL_KINDS } from "@/components/graph/GraphFilterPanel";
import { KIND_COLORS, KIND_LABELS } from "@/components/graph/graphTheme";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/cn";

/**
 * Reads the canvas.
 *
 * Until now the three item-kind colours were undocumented anywhere in the UI -- the
 * graph used blue/green/amber and simply expected the reader to infer what they
 * meant. The relation styles added in this pass would have compounded that, so both
 * encodings are spelled out here. Collapsed by default: it is a reference, not a
 * control, and it should not compete with the graph for space.
 */
export function GraphLegend() {
  const [open, setOpen] = useState(false);

  return (
    <GlassPanel className="w-52 overflow-hidden p-0 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 transition-colors hover:bg-white/40"
      >
        <span className="text-xs font-semibold">Legend</span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-white/50 px-3 py-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold tracking-wide text-gray-600 uppercase">Item kind</p>
            {ALL_KINDS.map((kind) => (
              <div key={kind} className="flex items-center gap-2 text-xs text-gray-800">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: KIND_COLORS[kind] }}
                />
                {KIND_LABELS[kind]}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold tracking-wide text-gray-600 uppercase">Relation</p>
            {RELATION_ORDER.map((relation) => {
              const meta = RELATIONS[relation];
              return (
                <div key={relation} className="flex items-center gap-2 text-xs text-gray-800">
                  <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true" className="shrink-0">
                    <line
                      x1="1"
                      y1="4"
                      x2={meta.directed ? 19 : 25}
                      y2="4"
                      stroke={meta.color}
                      strokeWidth="1.8"
                      strokeDasharray={meta.dash ? meta.dash.join(" ") : undefined}
                    />
                    {meta.directed && <polygon points="19,1 25,4 19,7" fill={meta.color} />}
                  </svg>
                  {meta.label}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] leading-snug text-gray-600">
            Node size grows with connection count. Labels appear as you zoom in.
          </p>
        </div>
      )}
    </GlassPanel>
  );
}
