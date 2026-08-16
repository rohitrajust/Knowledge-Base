"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { api, ApiError } from "@/lib/api-client";
import type { MemorySummary } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";

export default function MemoryPage({ params }: PageProps<'/spaces/[spaceId]/memory'>) {
  const { spaceId } = use(params);

  const [memories, setMemories] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<MemorySummary[]>(`/api/v1/spaces/${spaceId}/memory`)
      .then(setMemories)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load memory."))
      .finally(() => setLoading(false));
  }, [spaceId]);

  async function handleDelete(memoryId: string) {
    await api.delete(`/api/v1/spaces/${spaceId}/memory/${memoryId}`);
    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Memory</h1>
        <Link href={`/spaces/${spaceId}`} className="text-sm text-gray-500 hover:text-brand-700">
          ← Back to space
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        Durable facts and decisions the team has discussed, shared across everyone in this
        space and forgotten automatically after 30 days.
      </p>

      <ErrorMessage>{error}</ErrorMessage>

      {loading ? (
        <LoadingState>Loading...</LoadingState>
      ) : memories.length === 0 ? (
        <EmptyState variant="block">Nothing remembered yet.</EmptyState>
      ) : (
        <MotionList className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {memories.map((memory) => (
              <MotionListItem key={memory.id}>
                <Card>
                  <p className="text-sm text-gray-900">{memory.content}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      Expires {new Date(memory.expires_at).toLocaleDateString()}
                    </span>
                    <Button variant="ghost-danger" size="sm" onClick={() => handleDelete(memory.id)}>
                      Forget
                    </Button>
                  </div>
                </Card>
              </MotionListItem>
            ))}
          </AnimatePresence>
        </MotionList>
      )}
    </div>
  );
}
