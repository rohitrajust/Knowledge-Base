"use client";

import { use, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, postStream } from "@/lib/api-client";
import type { ConversationDetail, Message, MessageSource } from "@/lib/types";
import { createDeltaFlusher } from "@/lib/stream";
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
  // The in-flight assistant reply, rendered token-by-token while the stream runs.
  const [streamingReply, setStreamingReply] = useState<{ content: string; sources: MessageSource[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api
      .get<ConversationDetail>(`/api/v1/spaces/${spaceId}/conversations/${conversationId}`)
      .then(setConversation)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load this conversation."));
    return () => abortRef.current?.abort();
  }, [spaceId, conversationId]);

  async function refreshConversation() {
    try {
      setConversation(
        await api.get<ConversationDetail>(`/api/v1/spaces/${spaceId}/conversations/${conversationId}`)
      );
    } catch {
      setError("Failed to reload this conversation.");
    }
  }

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || !conversation || sending) return;
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
    setStreamingReply({ content: "", sources: [] });

    // Token chunks arrive faster than React should re-render; coalesce them.
    const flusher = createDeltaFlusher((chunk) => {
      setStreamingReply((prev) => (prev ? { ...prev, content: prev.content + chunk } : prev));
    });
    const controller = new AbortController();
    abortRef.current = controller;
    // Held in an object because the assignment happens inside the event callback;
    // TS cannot narrow a bare `let` across that boundary.
    const doneRef: { message: Message | null } = { message: null };

    try {
      await postStream(
        `/api/v1/spaces/${spaceId}/conversations/${conversationId}/messages/stream`,
        { question: questionText },
        (chatEvent) => {
          if (chatEvent.type === "sources") {
            const sources = chatEvent.sources as MessageSource[];
            setStreamingReply((prev) => (prev ? { ...prev, sources } : prev));
          } else if (chatEvent.type === "delta") {
            flusher.push(chatEvent.text);
          } else if (chatEvent.type === "done") {
            doneRef.message = chatEvent.message ?? null;
          } else {
            throw new ApiError(502, chatEvent.error.code, chatEvent.error.message);
          }
        },
        controller.signal
      );
      flusher.flushNow();
      if (doneRef.message) {
        const persisted = doneRef.message;
        setConversation((prev) =>
          prev ? { ...prev, messages: [...prev.messages, persisted] } : prev
        );
      } else {
        // No canonical row arrived (e.g. aborted client-side); the server still
        // persisted the full answer, so resync rather than guess.
        await refreshConversation();
      }
    } catch (err) {
      // The user turn is already durable server-side and a completed answer is
      // persisted even after an abort -- resync instead of dropping state.
      if (controller.signal.aborted) {
        // User pressed Stop; the server still persisted the full answer.
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to get an answer.");
      }
      await refreshConversation();
    } finally {
      flusher.dispose();
      abortRef.current = null;
      setStreamingReply(null);
      setSending(false);
    }
  }

  async function handleEnd() {
    setEnding(true);
    setError(null);
    try {
      // Returns 202 immediately; the memory summary trails in a background task and
      // shows up on the memory page when ready.
      await api.post<{ status: string }>(`/api/v1/spaces/${spaceId}/conversations/${conversationId}/end`);
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
              message.role === "user"
                ? "border-brand-200/60 bg-brand-50/55 backdrop-blur-md"
                : "border-white/70 bg-white/80 backdrop-blur-md"
            )}
          >
            <p className="text-xs uppercase tracking-wide text-gray-400">{message.role}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{message.content}</p>
            {message.sources && message.sources.length > 0 && (
              <MessageSources spaceId={spaceId} sources={message.sources} />
            )}
          </div>
        ))}

        {streamingReply && (
          <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur-md">
            <p className="text-xs uppercase tracking-wide text-gray-400">assistant</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
              {streamingReply.content}
              <span aria-hidden className="animate-pulse text-gray-400">▍</span>
            </p>
            {/* Sources render the moment retrieval finishes -- long before the answer */}
            {streamingReply.sources.length > 0 && (
              <MessageSources spaceId={spaceId} sources={streamingReply.sources} />
            )}
          </div>
        )}
      </div>

      {!conversation.ended_at && (
        <form onSubmit={handleAsk} className="flex gap-2">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a follow-up..."
            className="flex-1"
            maxLength={2000}
          />
          {sending ? (
            <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit">Ask</Button>
          )}
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

function MessageSources({ spaceId, sources }: { spaceId: string; sources: MessageSource[] }) {
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-gray-900/8 pt-2">
      {sources.map((source, index) => (
        <Link
          key={source.item_id}
          href={`/spaces/${spaceId}/items/${source.item_id}`}
          className="text-xs text-brand-700 hover:underline"
        >
          [{index + 1}] {source.title}
        </Link>
      ))}
    </div>
  );
}
