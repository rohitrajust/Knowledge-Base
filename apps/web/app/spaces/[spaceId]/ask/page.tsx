"use client";

import { use, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, postStream } from "@/lib/api-client";
import type { AskResponse, SearchResult } from "@/lib/types";
import { createDeltaFlusher } from "@/lib/stream";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Badge } from "@/components/ui/Badge";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";
import { snippet } from "@/lib/text";

export default function AskPage({ params }: PageProps<'/spaces/[spaceId]/ask'>) {
  const { spaceId } = use(params);

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    // Stream the same answer the buffered endpoint would return; sources appear as
    // soon as retrieval finishes and tokens render as they arrive.
    setResult({ answer: "", sources: [] });
    const flusher = createDeltaFlusher((chunk) => {
      setResult((prev) => (prev ? { ...prev, answer: prev.answer + chunk } : prev));
    });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await postStream(
        `/api/v1/spaces/${spaceId}/ask/stream`,
        { question },
        (chatEvent) => {
          if (chatEvent.type === "sources") {
            const sources = chatEvent.sources as SearchResult[];
            setResult((prev) => (prev ? { ...prev, sources } : prev));
          } else if (chatEvent.type === "delta") {
            flusher.push(chatEvent.text);
          } else if (chatEvent.type === "done") {
            // Final event; nothing beyond what sources/deltas already delivered.
          } else {
            throw new ApiError(502, chatEvent.error.code, chatEvent.error.message);
          }
        },
        controller.signal
      );
      flusher.flushNow();
    } catch (err) {
      // A stopped stream keeps whatever already rendered -- it is a real partial
      // view of a grounded answer, not an error state. (`controller.signal`, not
      // stale component state, is the source of truth for whether we aborted.)
      if (!controller.signal.aborted) {
        setError(err instanceof ApiError ? err.message : "Failed to get an answer.");
      }
    } finally {
      flusher.dispose();
      abortRef.current = null;
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Ask</h1>
        <Link href={`/spaces/${spaceId}`} className="text-sm text-gray-500 hover:text-brand-700">
          ← Back to space
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a question about this space's knowledge..."
          className="flex-1"
          maxLength={2000}
        />
        {loading ? (
          <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        ) : (
          <Button type="submit">Ask</Button>
        )}
      </form>

      <ErrorMessage>{error}</ErrorMessage>

      {result && (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="whitespace-pre-wrap text-sm text-gray-900">
              {result.answer}
              {loading && <span aria-hidden className="animate-pulse text-gray-400">▍</span>}
            </p>
          </Card>

          {/* Sources render as soon as retrieval finishes -- long before generation */}
          {result.sources.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-gray-700">Sources</h2>
              <MotionList className="flex flex-col gap-2">
                {result.sources.map((source, index) => (
                  <MotionListItem key={source.item.id}>
                    <ListRow href={`/spaces/${spaceId}/items/${source.item.id}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">
                          [{index + 1}] {source.item.title}
                        </span>
                        <Badge>{source.item.kind}</Badge>
                      </div>
                      {source.item.body && (
                        <p className="mt-1 text-sm text-gray-500">{snippet(source.item.body)}</p>
                      )}
                    </ListRow>
                  </MotionListItem>
                ))}
              </MotionList>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
