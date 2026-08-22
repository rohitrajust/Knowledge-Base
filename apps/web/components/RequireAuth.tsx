"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingState } from "@/components/ui/LoadingState";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    // Shared spinner rather than a bare text node: this is the first thing every
    // authenticated page shows, so it should speak the same visual language.
    return (
      <div className="p-8">
        <LoadingState>Checking your session...</LoadingState>
      </div>
    );
  }

  return <>{children}</>;
}
