"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { motionTokens } from "@/lib/motionTokens";

const MotionLink = motion.create(Link);

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
        "block rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
        className
      )}
    >
      {children}
    </MotionLink>
  );
}
