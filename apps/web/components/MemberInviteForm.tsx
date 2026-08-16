"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { Membership } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export function MemberInviteForm({
  spaceId,
  onInvited,
}: {
  spaceId: string;
  onInvited: (membership: Membership) => void;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const membership = await api.post<Membership>(`/api/v1/spaces/${spaceId}/members`, { email });
      setEmail("");
      onInvited(membership);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not invite that user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-1 flex-col gap-1">
        <Input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Invite by email (must already have an account)"
        />
        <ErrorMessage>{error}</ErrorMessage>
      </div>
      <Button type="submit" disabled={submitting}>
        Invite
      </Button>
    </form>
  );
}
