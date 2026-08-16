"use client";

import { use, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { AskResponse } from "@/lib/types";
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.post<AskResponse>(`/api/v1/spaces/${spaceId}/ask`, { question });
      setResult(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get an answer.");
    } finally {
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
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Thinking..." : "Ask"}
        </Button>
      </form>

      <ErrorMessage>{error}</ErrorMessage>

      {result && (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="whitespace-pre-wrap text-sm text-gray-900">{result.answer}</p>
          </Card>

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
