import type { ItemKind } from "@/lib/types";

/**
 * Canvas colours, read once from the CSS custom properties that drive the rest of
 * the app.
 *
 * A 2D canvas context cannot resolve `var(--color-brand-600)`, so before this module
 * existed the graph hardcoded its own hex values -- and they had silently drifted out
 * of sync with globals.css, leaving the canvas rendering a different teal family than
 * every surface around it (the constants were even still annotated with the names of
 * palette entries whose values had since changed). Reading the live computed values
 * makes that class of drift structurally impossible.
 */
export interface GraphTheme {
  /** Ring around the hovered/selected node. */
  highlightRing: string;
  /** Ring around 1-hop neighbours of the active node. */
  neighborRing: string;
  /** Edge colour when incident to the active node, overriding the relation colour. */
  linkActive: string;
  /** Frosted pill behind a label, so text survives crossing an edge. */
  labelBg: string;
  labelBorder: string;
  labelText: string;
  labelTextMuted: string;
  /** Halo drawn just outside a node so it reads as sitting *on* the glass field. */
  nodeRim: string;
  /** Ring on nodes matching the current search -- deliberately not a brand colour,
   *  so "found" cannot be confused with "hovered" or "selected". */
  searchRing: string;
}

/**
 * Item-kind colours are deliberately NOT brand teal and are not read from CSS: they
 * encode a domain meaning (what sort of thing this is) that the chrome palette does
 * not, and the redesign that introduced the brand tokens explicitly left them alone.
 * Relation colours live in lib/relations.ts for the same reason -- they encode a
 * different dimension again, and are shared with the legend and the link picker.
 */
export const KIND_COLORS: Record<ItemKind, string> = {
  note: "#2563eb",
  document: "#16a34a",
  reference: "#d97706",
};

export const KIND_LABELS: Record<ItemKind, string> = {
  note: "Note",
  document: "Document",
  reference: "Reference",
};

const FALLBACK: GraphTheme = {
  highlightRing: "#045c61",
  neighborRing: "#35a3ab",
  linkActive: "#036e74",
  labelBg: "rgba(255, 255, 255, 0.78)",
  labelBorder: "rgba(255, 255, 255, 0.9)",
  labelText: "#1f2937",
  labelTextMuted: "#4b5563",
  nodeRim: "rgba(255, 255, 255, 0.72)",
  searchRing: "#b45309",
};

export function readGraphTheme(): GraphTheme {
  if (typeof window === "undefined") return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    highlightRing: read("--color-brand-700", FALLBACK.highlightRing),
    neighborRing: read("--color-brand-400", FALLBACK.neighborRing),
    linkActive: read("--color-brand-600", FALLBACK.linkActive),
    labelBg: FALLBACK.labelBg,
    labelBorder: FALLBACK.labelBorder,
    labelText: FALLBACK.labelText,
    labelTextMuted: FALLBACK.labelTextMuted,
    nodeRim: FALLBACK.nodeRim,
    searchRing: FALLBACK.searchRing,
  };
}
