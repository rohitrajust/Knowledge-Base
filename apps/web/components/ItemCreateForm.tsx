"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { Item, ItemKind } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export function ItemCreateForm({
  spaceId,
  onCreated,
}: {
  spaceId: string;
  onCreated: (item: Item) => void;
}) {
  const [kind, setKind] = useState<ItemKind>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    if (kind === "reference" && !url.trim()) {
      setError("A reference needs a URL.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const item = await api.post<Item>(`/api/v1/spaces/${spaceId}/items`, {
        kind,
        title,
        body,
        url: url.trim() || undefined,
      });
      setTitle("");
      setBody("");
      setUrl("");
      onCreated(item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create item.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass flex flex-col gap-3 rounded-glass p-4"
    >
      <div className="flex gap-2">
        <Select value={kind} onChange={(event) => setKind(event.target.value as ItemKind)}>
          <option value="note">Note</option>
          <option value="document">Document</option>
          <option value="reference">Reference</option>
        </Select>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          className="flex-1"
        />
      </div>
      {kind === "reference" && (
        <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
      )}
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={kind === "reference" ? "Notes about this reference (optional)" : "Content"}
        rows={3}
      />
      <div className="flex items-center justify-between">
        <Button type="submit" disabled={submitting}>
          Add
        </Button>
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    </form>
  );
}
