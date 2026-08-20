"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "neutral" | "brand" | "outline";

// Translucent tints rather than flat fills, so a badge sitting on a glass card
// picks up the aurora behind it instead of punching an opaque hole in the panel.
const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-gray-500/10 text-gray-600 ring-1 ring-gray-500/15",
  brand: "bg-brand-500/12 text-brand-700 ring-1 ring-brand-500/20",
  outline: "text-gray-600 ring-1 ring-gray-400/40",
};

export function Badge({
  variant = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-sm",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
