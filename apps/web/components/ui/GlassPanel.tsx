"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

type GlassVariant = "subtle" | "default" | "strong";

const VARIANTS: Record<GlassVariant, string> = {
  subtle: "glass-subtle",
  default: "glass",
  strong: "glass-strong",
};

/**
 * The shared frosted-surface primitive.
 *
 * `Card` is the in-flow document surface; `GlassPanel` is the *floating overlay*
 * surface -- graph toolbars, legends, minimaps, detail panels. They are kept
 * separate so the graph's chrome can never drift stylistically from the rest of
 * the app: both draw from the same tokens, but only one of them is allowed to
 * float over a canvas.
 *
 * Variant guidance is an accessibility rule, not a taste one (see globals.css):
 * `strong` (80% white) is the only variant body text may sit on; `subtle` (45%)
 * is for decorative chrome and chips. Defaulting to `default` keeps short labels
 * and controls legible while still reading as glass.
 */
export function GlassPanel({
  variant = "default",
  elevated = false,
  className,
  ...props
}: ComponentPropsWithRef<"div"> & { variant?: GlassVariant; elevated?: boolean }) {
  return (
    <div
      className={cn("rounded-glass", VARIANTS[variant], elevated && "shadow-glass-lg", className)}
      {...props}
    />
  );
}
