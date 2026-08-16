"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { motionTokens } from "@/lib/motionTokens";

// Shared stagger-entrance list wrapper. Individual items opt into the same
// entrance/exit language via `MotionListItem` below, so every list in the app
// (item list, search results, conversations, memory, suggestions) animates
// consistently instead of each page hand-rolling its own stagger.
export function MotionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.ul
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: reduceMotion ? 0 : motionTokens.stagger } },
      }}
    >
      {children}
    </motion.ul>
  );
}

export function MotionListItem({
  children,
  className,
  layout = false,
}: {
  children: ReactNode;
  className?: string;
  /** Only enable for small, single-column lists -- see motion-ui skill's layout-prop guidance. */
  layout?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.li
      layout={layout && !reduceMotion}
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth },
        },
        exit: {
          opacity: 0,
          x: reduceMotion ? 0 : -motionTokens.distance.md,
          transition: { duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp },
        },
      }}
      exit="exit"
    >
      {children}
    </motion.li>
  );
}
