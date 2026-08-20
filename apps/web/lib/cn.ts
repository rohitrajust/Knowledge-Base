import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `cn` was previously plain clsx, which meant a `className` prop passed to a
// primitive *appended* rather than overrode -- conflicts then resolved by
// generated-stylesheet order, not by argument order. That made every
// `<Card className="rounded-none">`-style override a coin flip (documented as a
// known trap in docs/architecture/frontend-redesign.md). twMerge makes the last
// conflicting utility win, which is what every call site already assumed.
//
// The three glass utilities are custom `@utility` classes twMerge has no built-in
// knowledge of, and they all set the same properties (background-color,
// backdrop-filter, border, box-shadow). Registering them as one class group means
// `cn("glass", "glass-strong")` collapses to `glass-strong` instead of emitting
// both and letting stylesheet order decide.
// The `<"glass">` type argument registers a *new* class-group id; without it
// twMerge's config type only admits its own built-in group names.
const twMerge = extendTailwindMerge<"glass">({
  extend: {
    classGroups: {
      glass: ["glass", "glass-strong", "glass-subtle"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
