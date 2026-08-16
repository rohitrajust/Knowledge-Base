"use client";

import { use, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { SearchResult } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";
import { snippet } from "@/lib/text";

export default function SearchPage({ params }: PageProps<'/spaces/[spaceId]/search'>) {
  const { spaceId } = use(params);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query });
      const searchResults = await api.get<SearchResult[]>(
        `/api/v1/spaces/${spaceId}/search?${params.toString()}`
      );
      setResults(searchResults);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Search</h1>
        <Link href={`/spaces/${spaceId}`} className="text-sm text-gray-500 hover:text-brand-700">
          ← Back to space
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search this space's knowledge..."
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          Search
        </Button>
      </form>

      <ErrorMessage>{error}</ErrorMessage>

      {results !== null &&
        (results.length === 0 ? (
          <EmptyState variant="block">No results.</EmptyState>
        ) : (
          <MotionList className="flex flex-col gap-2">
            {results.map((result) => (
              <MotionListItem key={result.item.id}>
                <ListRow href={`/spaces/${spaceId}/items/${result.item.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{result.item.title}</span>
                    <Badge>{result.item.kind}</Badge>
                  </div>
                  {result.item.body && (
                    <p className="mt-1 text-sm text-gray-500">{snippet(result.item.body)}</p>
                  )}
                </ListRow>
              </MotionListItem>
            ))}
          </MotionList>
        ))}
    </div>
  );
}
