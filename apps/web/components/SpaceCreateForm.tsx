"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { Space } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export function SpaceCreateForm({ onCreated }: { onCreated: (space: Space) => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const space = await api.post<Space>("/api/v1/spaces", { name: name.trim() });
      setName("");
      onCreated(space);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create space.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-1 flex-col gap-1">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New space name"
        />
        <ErrorMessage>{error}</ErrorMessage>
      </div>
      <Button type="submit" disabled={submitting}>
        Create
      </Button>
    </form>
  );
}
