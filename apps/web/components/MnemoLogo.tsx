"use client";

import { cn } from "@/lib/cn";

// A small three-node graph glyph -- a nod to Mnemo's own knowledge-graph feature.
export function MnemoLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="6" cy="7" r="2.4" fill="currentColor" opacity="0.55" />
        <circle cx="18" cy="7" r="2.4" fill="currentColor" opacity="0.55" />
        <circle cx="12" cy="17" r="2.8" fill="currentColor" />
        <path d="M7.6 8.6 10.4 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
        <path d="M16.4 8.6 13.6 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      </svg>
      <span className="text-base font-semibold tracking-tight">Mnemo</span>
    </span>
  );
}
