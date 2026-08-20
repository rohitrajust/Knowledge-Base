"use client";

import Link from "next/link";
import { Maximize2, Minimize2, RotateCcw, Scan, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/cn";

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-white/60 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
    >
      {children}
    </button>
  );
}

export function GraphToolbar({
  spaceId,
  query,
  onQueryChange,
  matchCount,
  onSubmitSearch,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  onToggleFullscreen,
  isFullscreen,
}: {
  spaceId: string;
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number | null;
  onSubmitSearch: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}) {
  return (
    <GlassPanel className="flex items-center gap-1 py-1.5 pr-1.5 pl-3">
      <h1 className="text-sm font-semibold text-gray-900">Graph</h1>
      <span className="mx-1 h-4 w-px bg-gray-900/10" aria-hidden="true" />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitSearch();
        }}
        className="relative flex items-center"
      >
        <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Find a note..."
          aria-label="Search the graph"
          // Chrome renders its own clear affordance for type="search"; suppressing it
          // avoids showing two X buttons side by side. The custom one stays because it
          // is the only version that is styled and positioned with the rest of the bar.
          className="w-44 rounded-lg border border-white/70 bg-white/55 py-1 pr-6 pl-7 text-xs text-gray-900 placeholder:text-gray-500 focus:border-brand-400 focus:bg-white/85 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            className="absolute right-1.5 text-gray-500 hover:text-gray-900"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </form>
      {matchCount !== null && (
        <span
          className={cn(
            "ml-1 text-[11px] tabular-nums",
            matchCount === 0 ? "text-red-600" : "text-gray-600"
          )}
        >
          {matchCount} {matchCount === 1 ? "match" : "matches"}
        </span>
      )}

      <span className="mx-1 h-4 w-px bg-gray-900/10" aria-hidden="true" />
      <ToolButton label="Zoom out" onClick={onZoomOut}>
        <ZoomOut className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton label="Zoom in" onClick={onZoomIn}>
        <ZoomIn className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton label="Zoom to fit" onClick={onFit}>
        <Scan className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton label="Reset view" onClick={onReset}>
        <RotateCcw className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton label={isFullscreen ? "Exit full screen" : "Full screen"} onClick={onToggleFullscreen}>
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </ToolButton>

      <span className="mx-1 h-4 w-px bg-gray-900/10" aria-hidden="true" />
      <Link
        href={`/spaces/${spaceId}`}
        className="rounded-lg px-2 py-1 text-xs text-gray-600 transition-colors hover:text-brand-700"
      >
        ← Back
      </Link>
    </GlassPanel>
  );
}
