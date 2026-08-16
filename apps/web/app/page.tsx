"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/spaces" : "/login");
  }, [loading, user, router]);

  return <p className="p-8 text-sm text-gray-500">Loading...</p>;
}
