"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { User } from "@/lib/types";
import { MnemoLogo } from "@/components/MnemoLogo";
import { UstMark } from "@/components/UstMark";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "signin") {
        await api.post<User>("/api/v1/auth/login", { email, password });
      } else {
        await api.post<User>("/api/v1/auth/signup", { email, display_name: displayName, password });
      }
      await refresh();
      router.push("/spaces");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-1 flex-col justify-center gap-6 p-8 text-gray-900">
      <div className="flex flex-col items-center gap-3 text-center">
        <MnemoLogo className="text-brand-700" />
        <p className="text-sm text-gray-500">
          {mode === "signin" ? "Sign in to your space." : "Create an account to get started."}
        </p>
      </div>

      <Card className="glass-strong flex flex-col gap-3 p-4">
        <div className="flex gap-1 rounded-xl bg-white/40 p-1 text-sm ring-1 ring-white/60">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
              mode === "signin"
                ? "bg-white/90 font-medium text-gray-900 shadow-[0_1px_2px_rgb(2_50_54/0.08)]"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
              mode === "signup"
                ? "bg-white/90 font-medium text-gray-900 shadow-[0_1px_2px_rgb(2_50_54/0.08)]"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <Input
              type="text"
              placeholder="Display name"
              aria-label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          )}
          <Input
            type="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      <div className="flex justify-center">
        <UstMark />
      </div>
    </main>
  );
}
