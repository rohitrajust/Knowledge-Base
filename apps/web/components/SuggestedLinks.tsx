"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { api, ApiError } from "@/lib/api-client";
import type { LinkedItem, RelationType, SearchResult } from "@/lib/types";
import { RELATIONS, RELATION_ORDER } from "@/lib/relations";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";

export function SuggestedLinks({
  spaceId,
  itemId,
  onApproved,
}: {
  spaceId: string;
  itemId: string;
  onApproved: () => void;
}) {
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-suggestion, not one shared value: approving three suggestions in a row
  // usually means three different relations, and a single shared select would
  // silently carry the previous choice into the next approval.
  const [relations, setRelations] = useState<Record<string, RelationType>>({});

  useEffect(() => {
    api
      .get<SearchResult[]>(`/api/v1/spaces/${spaceId}/items/${itemId}/suggested-links`)
      .then(setSuggestions)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load suggestions."))
      .finally(() => setLoading(false));
  }, [spaceId, itemId]);

  function dismiss(candidateId: string) {
    setSuggestions((prev) => prev.filter((s) => s.item.id !== candidateId));
  }

  async function approve(candidateId: string) {
    setError(null);
    try {
      await api.post<LinkedItem>(`/api/v1/spaces/${spaceId}/items/${itemId}/links`, {
        other_item_id: candidateId,
        relation: relations[candidateId] ?? "related",
      });
      dismiss(candidateId);
      onApproved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create link.");
    }
  }

  if (loading || suggestions.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-gray-700">Suggested links</h2>
      <MotionList className="flex flex-col gap-1">
        <AnimatePresence mode="popLayout">
          {suggestions.map((suggestion) => (
            <MotionListItem key={suggestion.item.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-900">
                {suggestion.item.title}{" "}
                <span className="text-xs text-gray-400">({suggestion.score.toFixed(2)})</span>
              </span>
              <span className="flex items-center gap-3">
                <Select
                  aria-label={`Relation for ${suggestion.item.title}`}
                  value={relations[suggestion.item.id] ?? "related"}
                  onChange={(event) =>
                    setRelations((prev) => ({
                      ...prev,
                      [suggestion.item.id]: event.target.value as RelationType,
                    }))
                  }
                  className="py-1 text-xs"
                >
                  {RELATION_ORDER.map((key) => (
                    <option key={key} value={key}>
                      {RELATIONS[key].label}
                    </option>
                  ))}
                </Select>
                <Button variant="link" size="sm" onClick={() => approve(suggestion.item.id)}>
                  Approve
                </Button>
                <Button variant="ghost-danger" size="sm" onClick={() => dismiss(suggestion.item.id)}>
                  Dismiss
                </Button>
              </span>
            </MotionListItem>
          ))}
        </AnimatePresence>
      </MotionList>
      <ErrorMessage>{error}</ErrorMessage>
    </section>
  );
}
