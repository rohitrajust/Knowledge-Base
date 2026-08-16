"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { motionTokens } from "@/lib/motionTokens";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "ghost-invert" | "ghost-danger" | "link";
type ButtonSize = "sm" | "md";

// Omit handlers whose native DOM signature conflicts with motion.button's
// gesture/animation-lifecycle prop types of the same name.
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
>;

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  secondary: "border border-border bg-surface text-gray-700 hover:bg-surface-muted",
  danger: "border border-red-300 text-red-600 hover:bg-red-50",
  ghost: "text-gray-500 hover:text-gray-900",
  "ghost-invert": "text-white/80 hover:text-white",
  "ghost-danger": "text-gray-400 hover:text-red-600",
  link: "p-0 text-brand-600 hover:underline",
};

// Only "boxed" variants get a hover scale -- inline text-style actions
// (ghost/ghost-invert/ghost-danger/link) rely on their existing color
// transition, since a scale pop reads oddly on baseline-aligned text.
const BOXED_VARIANTS = new Set<ButtonVariant>(["primary", "secondary", "danger"]);

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: NativeButtonProps & { variant?: ButtonVariant; size?: ButtonSize }) {
  const reduceMotion = useReducedMotion();
  const sizeClass = variant === "link" ? "" : SIZES[size];
  const boxed = BOXED_VARIANTS.has(variant);

  return (
    <motion.button
      className={cn(BASE, sizeClass, VARIANTS[variant], className)}
      whileHover={!reduceMotion && boxed ? { scale: 1.02 } : undefined}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}
      {...props}
    />
  );
}
