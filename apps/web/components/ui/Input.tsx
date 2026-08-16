"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, className)} {...props} />;
}

export { FIELD as inputFieldClassName };
