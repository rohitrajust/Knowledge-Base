"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// The single field surface, shared verbatim by Input, Textarea and Select --
// previously this class string was duplicated (and drifting) across all three.
// Width is deliberately excluded: Select sizes to its content, the other two
// don't, so each caller adds its own.
//
// 55% white is below the "body text" glass threshold on purpose: the rule in
// globals.css governs grey text on panels, and these fields carry near-black
// text-gray-900, which stays far above 4.5:1 even over the brightest part of the
// aurora. The placeholder is gray-500 rather than the old gray-400, which
// measured only ~2.2:1 once the surface became translucent.
// `transition` deliberately lists box-shadow alongside the colors: the focus ring
// is a box-shadow, so plain `transition-colors` would make the ring pop in a single
// frame instead of easing in with the border/background.
const GLASS_FIELD =
  "rounded-xl border border-white/70 bg-white/55 px-3 py-2 text-sm text-gray-900 backdrop-blur-sm transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-gray-500 focus:border-brand-400 focus:bg-white/85 focus:outline-none focus:ring-2 focus:ring-brand-400/25";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("w-full", GLASS_FIELD, className)} {...props} />;
}

export { GLASS_FIELD, GLASS_FIELD as inputFieldClassName };
