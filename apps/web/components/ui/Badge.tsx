"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "neutral" | "brand" | "outline";

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-gray-100 text-gray-500",
  brand: "bg-brand-100 text-brand-700",
  outline: "border border-border text-gray-500",
};

export function Badge({
  variant = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
