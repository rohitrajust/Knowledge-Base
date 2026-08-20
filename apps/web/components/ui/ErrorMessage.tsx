"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { motionTokens } from "@/lib/motionTokens";

// Self-contained enter/exit: every page already does `<ErrorMessage>{error}</ErrorMessage>`
// unconditionally (this component owns the `!children -> null` gate), so wrapping that
// gate in AnimatePresence here gives every error message in the app a consistent
// fade+slide transition without any page needing its own AnimatePresence.
export function ErrorMessage({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      {children ? (
        <motion.p
          key="error"
          role="alert"
          initial={{ opacity: 0, y: reduceMotion ? 0 : -motionTokens.distance.sm }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -motionTokens.distance.sm }}
          transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.smooth }}
          className={cn("text-sm text-danger-text", className)}
        >
          {children}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
