"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { Item } from "@/lib/types";
import { ItemLinkPicker } from "@/components/ItemLinkPicker";
import { SuggestedLinks } from "@/components/SuggestedLinks";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function ItemDetailPage({ params }: PageProps<'/spaces/[spaceId]/items/[itemId]'>) {
  const { spaceId, itemId } = use(params);
  const router = useRouter();

  const [item, setItem] = useState<Item | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linksVersion, setLinksVersion] = useState(0);

  useEffect(() => {
    api
      .get<Item>(`/api/v1/spaces/${spaceId}/items/${itemId}`)
      .then((loaded) => {
        setItem(loaded);
        setTitle(loaded.title);
        setBody(loaded.body);
        setUrl(loaded.url ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load this item."));
  }, [spaceId, itemId]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (item?.kind === "reference" && !url.trim()) {
      setError("A reference needs a URL.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<Item>(`/api/v1/spaces/${spaceId}/items/${itemId}`, {
        title,
        body,
        url: url.trim() || null,
      });
      setItem(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await api.delete(`/api/v1/spaces/${spaceId}/items/${itemId}`);
    router.push(`/spaces/${spaceId}`);
  }

  if (error && !item) {
    return (
      <div className="p-6 sm:p-8">
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-6 sm:p-8">
        <LoadingState>Loading...</LoadingState>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 sm:p-8">
      <Link href={`/spaces/${spaceId}`} className="text-sm text-gray-500 hover:text-brand-700">
        ← Back to space
      </Link>

      <Badge className="self-start">{item.kind}</Badge>

      <form onSubmit={handleSave} className="flex flex-col gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="text-lg font-semibold"
        />
        {item.kind === "reference" && (
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
        )}
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={10} />
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              Save
            </Button>
            <Button type="button" variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </div>
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      </form>

      <ItemLinkPicker key={linksVersion} spaceId={spaceId} itemId={itemId} />
      <SuggestedLinks spaceId={spaceId} itemId={itemId} onApproved={() => setLinksVersion((v) => v + 1)} />
    </div>
  );
}
