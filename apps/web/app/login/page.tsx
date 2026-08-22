"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { User } from "@/lib/types";
import { MnemoLogo } from "@/components/MnemoLogo";
import { UstMark } from "@/components/UstMark";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { motionTokens } from "@/lib/motionTokens";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { refresh } = useAuth();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
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
        await api.post<User>("/api/v1/auth/signup", { email, display_name: displayName.trim(), password });
      }
      await refresh();
      router.push("/spaces");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // Shared by both tabs: the active-tab background is one element that slides
  // between them via layoutId -- the same pattern as the sidebar's active pill --
  // instead of two backgrounds crossfading.
  const tabPill = (activeMode: Mode) =>
    mode === activeMode ? (
      <motion.span
        layoutId="auth-tab-pill"
        className="absolute inset-0 rounded-lg bg-white/90 shadow-[0_1px_2px_rgb(2_50_54/0.08)]"
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }
        }
      />
    ) : null;

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
            className={
              "relative flex-1 rounded-lg px-3 py-1.5 transition-colors " +
              (mode === "signin" ? "font-medium text-gray-900" : "text-gray-600 hover:text-gray-900")
            }
          >
            {tabPill("signin")}
            <span className="relative z-10">Sign in</span>
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={
              "relative flex-1 rounded-lg px-3 py-1.5 transition-colors " +
              (mode === "signup" ? "font-medium text-gray-900" : "text-gray-600 hover:text-gray-900")
            }
          >
            {tabPill("signup")}
            <span className="relative z-10">Sign up</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {mode === "signup" && (
              <motion.div
                key="display-name"
                initial={reduceMotion ? false : { opacity: 0, height: 0, marginBottom: "-12px" }}
                animate={{ opacity: 1, height: "auto", marginBottom: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: "-12px" }}
                transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.smooth }}
                className="overflow-hidden"
              >
                <Input
                  type="text"
                  placeholder="Display name"
                  aria-label="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </motion.div>
            )}
          </AnimatePresence>
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
        <UstMark variant="black" className="h-20" />
      </div>
    </main>
  );
}
