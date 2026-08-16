"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Home, Search, Share2, MessageSquare, Brain } from "lucide-react";
import { api } from "@/lib/api-client";
import type { Space } from "@/lib/types";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";
import { cn } from "@/lib/cn";
import { motionTokens } from "@/lib/motionTokens";

const NAV_ITEMS = [
  { label: "Overview", icon: Home, segment: "" },
  { label: "Search", icon: Search, segment: "/search" },
  { label: "Graph", icon: Share2, segment: "/graph" },
  { label: "Conversations", icon: MessageSquare, segment: "/conversations" },
  { label: "Memory", icon: Brain, segment: "/memory" },
];

export function Sidebar({
  spaceId,
  open,
  onClose,
}: {
  spaceId: string;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Best-effort: the switcher list is a navigation convenience, not core page
    // data, so a failed fetch here shouldn't block or error the rest of the shell.
    api.get<Space[]>("/api/v1/spaces").then(setSpaces).catch(() => {});
  }, []);

  const base = `/spaces/${spaceId}`;

  return (
    <>
      {/* Backdrop is fully mount/unmount-driven (mobile-only, no responsive
          transform conflict), so it's safe to hand entirely to AnimatePresence. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-30 bg-black/30 md:hidden"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionTokens.duration.fast }}
          />
        )}
      </AnimatePresence>
      {/* The panel itself stays CSS-transform-driven (transition-transform + the
          md:translate-x-0 breakpoint override): Motion writes transform via inline
          style, which would always beat a Tailwind md: utility regardless of
          viewport, so a responsive slide-in/out is safer to leave to CSS here. */}
      <nav
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col gap-4 border-r border-border bg-surface px-3 py-4 transition-transform duration-200 md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SpaceSwitcher spaces={spaces} currentSpaceId={spaceId} />
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ label, icon: Icon, segment }) => {
            const href = `${base}${segment}`;
            const active = segment === "" ? pathname === base : pathname.startsWith(href);
            return (
              <li key={label}>
                <Link
                  href={href}
                  onClick={onClose}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active ? "font-medium text-brand-800" : "text-gray-600 hover:bg-surface-muted hover:text-gray-900"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="absolute inset-0 rounded-md border-l-2 border-brand-600 bg-brand-50"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }
                      }
                    />
                  )}
                  <Icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
