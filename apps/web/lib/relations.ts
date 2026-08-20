import type { RelationType } from "@/lib/types";

export interface RelationMeta {
  /** How the relation reads from the source item: "A <label> B". */
  label: string;
  /** How it reads from the target item: "B <inverseLabel> A". */
  inverseLabel: string;
  directed: boolean;
  /**
   * Canvas needs a literal colour (a 2D context cannot resolve a CSS variable),
   * so these are hex rather than tokens. They are intentionally distinct hues
   * from the three item-kind colours, which encode a different dimension.
   */
  color: string;
  /**
   * setLineDash pattern, or null for solid. Relation type must survive without
   * colour -- both for colourblind readers and at zoom levels where a 0.8px line
   * carries almost no perceptible hue.
   */
  dash: number[] | null;
}

/**
 * The single source of truth for relation presentation, shared by the graph
 * canvas painter, the link picker, and the legend. Adding a relation means
 * editing this map, the RelationType union, and the API's CHECK constraint --
 * and nothing else.
 */
export const RELATIONS: Record<RelationType, RelationMeta> = {
  related: {
    label: "Related to",
    inverseLabel: "Related to",
    directed: false,
    color: "#8b98a5",
    dash: null,
  },
  references: {
    label: "References",
    inverseLabel: "Referenced by",
    directed: true,
    color: "#2563eb",
    dash: null,
  },
  depends_on: {
    label: "Depends on",
    inverseLabel: "Required by",
    directed: true,
    color: "#c2410c",
    dash: [6, 3],
  },
  supersedes: {
    label: "Supersedes",
    inverseLabel: "Superseded by",
    directed: true,
    color: "#7c3aed",
    dash: [2, 3],
  },
  part_of: {
    label: "Part of",
    inverseLabel: "Contains",
    directed: true,
    color: "#0f766e",
    dash: [10, 3, 2, 3],
  },
};

export const RELATION_ORDER: RelationType[] = [
  "related",
  "references",
  "depends_on",
  "supersedes",
  "part_of",
];

/** The label to show for a link as seen from the item currently being viewed. */
export function relationLabelFor(relation: RelationType, directionOut: "out" | "in" | "none"): string {
  const meta = RELATIONS[relation];
  return directionOut === "in" ? meta.inverseLabel : meta.label;
}
