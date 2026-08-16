"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { motionTokens } from "@/lib/motionTokens";

export function EmptyState({
  children,
  variant = "inline",
  className,
}: {
  children: ReactNode;
  variant?: "inline" | "block";
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const fadeIn = {
    initial: { opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm },
    animate: { opacity: 1, y: 0 },
    transition: { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth },
  };

  if (variant === "block") {
    return (
      <motion.div
        {...fadeIn}
        className={cn(
          "rounded-xl border border-dashed border-border bg-surface-muted px-4 py-8 text-center text-sm text-gray-500",
          className
        )}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.p {...fadeIn} className={cn("text-sm text-gray-500", className)}>
      {children}
    </motion.p>
  );
}
