"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { ItemKind, RelationType } from "@/lib/types";
import { RELATIONS, RELATION_ORDER } from "@/lib/relations";
import { KIND_COLORS, KIND_LABELS } from "@/components/graph/graphTheme";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/cn";

export const ALL_KINDS: ItemKind[] = ["note", "document", "reference"];

export interface GraphFilters {
  kinds: Set<ItemKind>;
  relations: Set<RelationType>;
  hideOrphans: boolean;
  minConnections: number;
}

export const DEFAULT_FILTERS: GraphFilters = {
  kinds: new Set(ALL_KINDS),
  relations: new Set(RELATION_ORDER),
  hideOrphans: false,
  minConnections: 0,
};

export function isDefaultFilters(f: GraphFilters): boolean {
  return (
    f.kinds.size === ALL_KINDS.length &&
    f.relations.size === RELATION_ORDER.length &&
    !f.hideOrphans &&
    f.minConnections === 0
  );
}

/**
 * Chips rather than checkboxes: each one carries its own colour or line style, so the
 * control doubles as a key for what is on screen. That matters more here than it
 * would in a form -- the previous three bare checkboxes gave no hint that "note" was
 * the blue one.
 */
export function GraphFilterPanel({
  filters,
  onChange,
  counts,
}: {
  filters: GraphFilters;
  onChange: (next: GraphFilters) => void;
  counts: { nodes: number; edges: number; total: number };
}) {
  const [open, setOpen] = useState(false);

  function toggleKind(kind: ItemKind) {
    const kinds = new Set(filters.kinds);
    if (kinds.has(kind)) kinds.delete(kind);
    else kinds.add(kind);
    onChange({ ...filters, kinds });
  }

  function toggleRelation(relation: RelationType) {
    const relations = new Set(filters.relations);
    if (relations.has(relation)) relations.delete(relation);
    else relations.add(relation);
    onChange({ ...filters, relations });
  }

  return (
    <GlassPanel className="w-60 overflow-hidden p-0 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 transition-colors hover:bg-white/40"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-semibold">Filters</span>
        <span className="ml-auto text-[11px] text-gray-600">
          {counts.nodes}/{counts.total}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-white/50 px-3 py-3">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[10px] font-semibold tracking-wide text-gray-600 uppercase">
              Kind
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {ALL_KINDS.map((kind) => {
                const on = filters.kinds.has(kind);
                return (
                  <label
                    key={kind}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors",
                      on ? "bg-white/75 text-gray-900" : "text-gray-500 hover:bg-white/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleKind(kind)}
                      className="sr-only"
                      aria-label={KIND_LABELS[kind]}
                    />
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: on ? KIND_COLORS[kind] : "transparent",
                        boxShadow: `inset 0 0 0 1.5px ${KIND_COLORS[kind]}`,
                      }}
                    />
                    {KIND_LABELS[kind]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[10px] font-semibold tracking-wide text-gray-600 uppercase">
              Relation
            </legend>
            <div className="flex flex-col gap-0.5">
              {RELATION_ORDER.map((relation) => {
                const on = filters.relations.has(relation);
                const meta = RELATIONS[relation];
                return (
                  <label
                    key={relation}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors",
                      on ? "text-gray-900" : "text-gray-500",
                      "hover:bg-white/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleRelation(relation)}
                      className="sr-only"
                      aria-label={meta.label}
                    />
                    {/* The swatch mirrors the canvas exactly -- same colour, same dash
                        pattern -- so the panel is also the legend for edge styles. */}
                    <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true" className="shrink-0">
                      <line
                        x1="1"
                        y1="4"
                        x2="21"
                        y2="4"
                        stroke={meta.color}
                        strokeWidth="1.8"
                        strokeDasharray={meta.dash ? meta.dash.join(" ") : undefined}
                        opacity={on ? 1 : 0.3}
                      />
                    </svg>
                    {meta.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[10px] font-semibold tracking-wide text-gray-600 uppercase">
              Connections
            </legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-800">
              <input
                type="checkbox"
                checked={filters.hideOrphans}
                onChange={() => onChange({ ...filters, hideOrphans: !filters.hideOrphans })}
                className="h-3.5 w-3.5 accent-brand-600"
              />
              Hide unconnected
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-800">
              <span className="flex items-center justify-between">
                <span>Minimum</span>
                <span className="tabular-nums text-gray-600">{filters.minConnections}</span>
              </span>
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={filters.minConnections}
                onChange={(event) =>
                  onChange({ ...filters, minConnections: Number(event.target.value) })
                }
                aria-label="Minimum connections"
                className="accent-brand-600"
              />
            </label>
          </fieldset>

          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS, kinds: new Set(ALL_KINDS), relations: new Set(RELATION_ORDER) })}
            className="self-start text-xs text-brand-700 hover:underline"
          >
            Reset filters
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
