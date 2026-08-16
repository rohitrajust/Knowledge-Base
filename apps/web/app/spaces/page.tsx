"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { Space } from "@/lib/types";
import { SpaceCreateForm } from "@/components/SpaceCreateForm";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Space[]>("/api/v1/spaces")
      .then(setSpaces)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load spaces."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Your spaces</h1>
        <p className="text-sm text-gray-500">
          A space is a shared project. Everything your team captures lives inside one.
        </p>
      </div>

      <SpaceCreateForm onCreated={(space) => setSpaces((prev) => [space, ...prev])} />

      <ErrorMessage>{error}</ErrorMessage>
      {loading ? (
        <LoadingState>Loading...</LoadingState>
      ) : spaces.length === 0 ? (
        <EmptyState variant="block">No spaces yet -- create one above.</EmptyState>
      ) : (
        <MotionList className="flex flex-col gap-2">
          {spaces.map((space) => (
            <MotionListItem key={space.id}>
              <ListRow href={`/spaces/${space.id}`}>
                <span className="font-medium text-gray-900">{space.name}</span>
                <span className="ml-2 text-xs text-gray-400">{space.slug}</span>
              </ListRow>
            </MotionListItem>
          ))}
        </MotionList>
      )}
    </div>
  );
}
