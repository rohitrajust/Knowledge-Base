"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { TopBar } from "@/components/layout/TopBar";

export default function SpacesLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="flex min-h-screen flex-1 flex-col bg-surface-muted">
        <TopBar />
        <div className="flex flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}
