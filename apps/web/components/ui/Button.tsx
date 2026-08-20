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
  "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-all disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white/50";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

// `primary` gets a vertical gradient plus an inset top highlight -- the same
// trick that makes a physical glass button read as lit from above. Without the
// highlight a flat teal fill looks pasted onto the frosted surfaces around it.
// `secondary` becomes glass so it reads as part of the same material system.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brand-600 to-brand-700 text-white hover:from-brand-700 hover:to-brand-800 [box-shadow:inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(2_50_54/0.18)]",
  secondary:
    "border border-white/70 bg-white/55 text-gray-700 backdrop-blur-sm hover:border-brand-200 hover:bg-white/80 hover:text-gray-900",
  danger: "border border-danger-border/70 bg-danger-bg/50 text-danger-text backdrop-blur-sm hover:bg-danger-bg/90",
  ghost: "text-gray-500 hover:text-gray-900",
  "ghost-invert": "text-white/80 hover:text-white",
  "ghost-danger": "text-gray-400 hover:text-danger-text",
  link: "p-0 text-brand-700 hover:underline",
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
