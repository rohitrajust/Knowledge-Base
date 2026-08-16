"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { ConversationDetail, Message, MemorySummary } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { cn } from "@/lib/cn";

export default function ConversationThreadPage({
  params,
}: PageProps<'/spaces/[spaceId]/conversations/[conversationId]'>) {
  const { spaceId, conversationId } = use(params);
  const router = useRouter();

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ConversationDetail>(`/api/v1/spaces/${spaceId}/conversations/${conversationId}`)
      .then(setConversation)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load this conversation."));
  }, [spaceId, conversationId]);

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || !conversation) return;
    const questionText = question;
    setQuestion("");
    setSending(true);
    setError(null);

    const userMessage: Message = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: questionText,
      sources: null,
      created_at: new Date().toISOString(),
    };
    setConversation({ ...conversation, messages: [...conversation.messages, userMessage] });

    try {
      const assistantMessage = await api.post<Message>(
        `/api/v1/spaces/${spaceId}/conversations/${conversationId}/messages`,
        { question: questionText }
      );
      setConversation((prev) =>
        prev ? { ...prev, messages: [...prev.messages, assistantMessage] } : prev
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get an answer.");
    } finally {
      setSending(false);
    }
  }

  async function handleEnd() {
    setEnding(true);
    setError(null);
    try {
      await api.post<MemorySummary | null>(`/api/v1/spaces/${spaceId}/conversations/${conversationId}/end`);
      router.push(`/spaces/${spaceId}/conversations`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not end this conversation.");
      setEnding(false);
    }
  }

  if (error && !conversation) {
    return (
      <div className="p-6 sm:p-8">
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="p-6 sm:p-8">
        <LoadingState>Loading...</LoadingState>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{conversation.title}</h1>
        <Link href={`/spaces/${spaceId}/conversations`} className="text-sm text-gray-500 hover:text-brand-700">
          ← Back to conversations
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "rounded-xl border px-4 py-3",
              message.role === "user" ? "border-border bg-surface-muted" : "border-border bg-surface"
            )}
          >
            <p className="text-xs uppercase tracking-wide text-gray-400">{message.role}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{message.content}</p>
            {message.sources && message.sources.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                {message.sources.map((source, index) => (
                  <Link
                    key={source.item_id}
                    href={`/spaces/${spaceId}/items/${source.item_id}`}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    [{index + 1}] {source.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!conversation.ended_at && (
        <form onSubmit={handleAsk} className="flex gap-2">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a follow-up..."
            className="flex-1"
          />
          <Button type="submit" disabled={sending}>
            {sending ? "Thinking..." : "Ask"}
          </Button>
        </form>
      )}

      <ErrorMessage>{error}</ErrorMessage>

      {!conversation.ended_at && (
        <Button variant="secondary" className="self-start" onClick={handleEnd} disabled={ending}>
          {ending ? "Ending..." : "End conversation"}
        </Button>
      )}
      {conversation.ended_at && <p className="text-sm text-gray-500">This conversation has ended.</p>}
    </div>
  );
}
