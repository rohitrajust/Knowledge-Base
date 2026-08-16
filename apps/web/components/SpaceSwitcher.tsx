"use client";

import { useRouter } from "next/navigation";
import type { Space } from "@/lib/types";
import { Select } from "@/components/ui/Select";

export function SpaceSwitcher({
  spaces,
  currentSpaceId,
}: {
  spaces: Space[];
  currentSpaceId?: string;
}) {
  const router = useRouter();

  return (
    <Select
      aria-label="Switch space"
      className="w-full"
      value={currentSpaceId ?? ""}
      onChange={(event) => {
        if (event.target.value) {
          router.push(`/spaces/${event.target.value}`);
        }
      }}
    >
      <option value="" disabled>
        Switch space...
      </option>
      {spaces.map((space) => (
        <option key={space.id} value={space.id}>
          {space.name}
        </option>
      ))}
    </Select>
  );
}
