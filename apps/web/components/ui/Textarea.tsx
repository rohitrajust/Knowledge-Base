"use client";

import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { GLASS_FIELD } from "@/components/ui/Input";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("w-full", GLASS_FIELD, className)} {...props} />;
}
