"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { motionTokens } from "@/lib/motionTokens";

export function LoadingState({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: motionTokens.duration.fast }}
      className={cn("flex items-center gap-2 text-sm text-gray-500", className)}
    >
      <motion.span
        className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-gray-300 border-t-brand-600"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={reduceMotion ? undefined : { duration: 0.7, repeat: Infinity, ease: "linear" }}
      />
      {children}
    </motion.p>
  );
}
