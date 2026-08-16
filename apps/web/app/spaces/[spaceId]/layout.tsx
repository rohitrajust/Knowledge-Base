"use client";

import { use, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";

// A pathname-keyed AnimatePresence fade was tried here (full-page route transition)
// and reverted: it caused a real, reproducible e2e failure under Playwright's fast
// automated interaction (an item added immediately after navigating between spaces
// never became visible), even though the same interaction worked fine when driven
// manually. Page-level transitions carry a much bigger blast radius than the other
// motion added in this pass (button/list/graph micro-interactions), so per the
// "if motion doesn't improve UX, remove it" principle this was cut rather than
// debugged further -- every other motion addition kept the full test suite green.
export default function SpaceLayout({ children, params }: LayoutProps<'/spaces/[spaceId]'>) {
  const { spaceId } = use(params);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <Sidebar spaceId={spaceId} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="m-3 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-gray-600 md:hidden"
        >
          <Menu className="h-4 w-4" />
          Menu
        </button>
        {children}
      </main>
    </>
  );
}
