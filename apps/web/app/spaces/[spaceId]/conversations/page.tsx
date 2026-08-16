"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Conversation } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MotionList, MotionListItem } from "@/components/ui/MotionList";

export default function ConversationsPage({ params }: PageProps<'/spaces/[spaceId]/conversations'>) {
  const { spaceId } = use(params);
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Conversation[]>(`/api/v1/spaces/${spaceId}/conversations`)
      .then(setConversations)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load conversations."))
      .finally(() => setLoading(false));
  }, [spaceId]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const conversation = await api.post<Conversation>(`/api/v1/spaces/${spaceId}/conversations`, {});
      router.push(`/spaces/${spaceId}/conversations/${conversation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start a conversation.");
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Conversations</h1>
        <Link href={`/spaces/${spaceId}`} className="text-sm text-gray-500 hover:text-brand-700">
          ← Back to space
        </Link>
      </div>

      <Button className="self-start" onClick={handleCreate} disabled={creating}>
        Start a conversation
      </Button>

      <ErrorMessage>{error}</ErrorMessage>

      {loading ? (
        <LoadingState>Loading...</LoadingState>
      ) : conversations.length === 0 ? (
        <EmptyState variant="block">No conversations yet.</EmptyState>
      ) : (
        <MotionList className="flex flex-col gap-2">
          {conversations.map((conversation) => (
            <MotionListItem key={conversation.id}>
              <ListRow href={`/spaces/${spaceId}/conversations/${conversation.id}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{conversation.title}</span>
                  {conversation.ended_at && <Badge>Ended</Badge>}
                </div>
              </ListRow>
            </MotionListItem>
          ))}
        </MotionList>
      )}
    </div>
  );
}
