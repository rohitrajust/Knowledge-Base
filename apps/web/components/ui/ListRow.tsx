"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { motionTokens } from "@/lib/motionTokens";

const MotionLink = motion.create(Link);

// Rows start at the quietest glass step and firm up on hover. The hover
// background/border are ordinary utilities layered over `glass-subtle` rather
// than a `hover:glass` variant: the `:hover` pseudo-class adds specificity, so
// they reliably win over the base utility's own background without depending on
// stylesheet ordering.
export function ListRow({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <MotionLink
      href={href}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}
      className={cn(
        "glass-subtle block rounded-glass px-4 py-3 transition-colors hover:border-brand-200 hover:bg-white/80 hover:shadow-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50",
        className
      )}
    >
      {children}
    </MotionLink>
  );
}
