"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { GLASS_FIELD } from "@/components/ui/Input";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(GLASS_FIELD, "py-2 pr-8 pl-2.5", className)} {...props}>
      {children}
    </select>
  );
}
