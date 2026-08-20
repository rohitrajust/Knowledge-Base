"use client";

import { Crosshair, X } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/cn";

export type FocusDepth = 1 | 2 | 0;

const DEPTHS: { value: FocusDepth; label: string }[] = [
  { value: 1, label: "1 hop" },
  { value: 2, label: "2 hops" },
  { value: 0, label: "All" },
];

/**
 * Tells you that you are in focus mode, on what, and how to get out.
 *
 * Focus dims most of the graph to near-invisibility, which without an explicit marker
 * is indistinguishable from "the graph failed to load" -- so this bar is what makes
 * the mode safe to enter.
 */
export function FocusBreadcrumb({
  title,
  depth,
  onDepthChange,
  visibleCount,
  onClear,
}: {
  title: string;
  depth: FocusDepth;
  onDepthChange: (depth: FocusDepth) => void;
  visibleCount: number;
  onClear: () => void;
}) {
  return (
    <GlassPanel variant="strong" className="flex items-center gap-2 py-1.5 pr-1.5 pl-3 text-sm">
      <Crosshair className="h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden="true" />
      <span className="max-w-[16rem] truncate font-medium text-gray-900">{title}</span>
      <span className="text-xs text-gray-600">{visibleCount} shown</span>

      <span className="mx-1 h-4 w-px bg-gray-900/10" aria-hidden="true" />
      <div className="flex items-center gap-0.5" role="group" aria-label="Focus depth">
        {DEPTHS.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => onDepthChange(value)}
            aria-pressed={depth === value}
            className={cn(
              "rounded-lg px-2 py-1 text-xs transition-colors",
              depth === value ? "bg-white/80 font-medium text-gray-900" : "text-gray-600 hover:bg-white/50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear focus"
        title="Clear focus (Esc)"
        className="rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-white/60 hover:text-gray-900"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </GlassPanel>
  );
}
