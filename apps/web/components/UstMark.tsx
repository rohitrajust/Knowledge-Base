"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

// Secondary co-brand mark: the real UST logo asset (apps/web/public/ust_logo.png),
// used on both the dark top bar and the light login page -- its teal background
// block matches the brand color on both, so no color/theming props are needed.
export function UstMark({ className }: { className?: string }) {
  return (
    <Image
      src="/ust_logo.png"
      alt="UST"
      title="Built with UST"
      width={250}
      height={102}
      className={cn("h-6 w-auto rounded-sm", className)}
    />
  );
}
