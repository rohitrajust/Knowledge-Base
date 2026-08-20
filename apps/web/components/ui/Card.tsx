"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// The in-flow document surface. `GlassPanel` is its floating-overlay sibling --
// same tokens, but only that one is allowed to sit over the graph canvas.
// `glass` supplies the background, hairline border and tinted shadow, so none of
// those are spelled out here.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-glass p-4", className)} {...props} />;
}
