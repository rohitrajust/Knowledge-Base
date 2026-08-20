"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

const SOURCES = {
  white: { src: "/ust_logo_white.png", width: 1363, height: 1154 },
  black: { src: "/ust_logo_black.png", width: 1391, height: 1131 },
} as const;

export function UstMark({ variant, className }: { variant: "white" | "black"; className?: string }) {
  const { src, width, height } = SOURCES[variant];
  return <Image src={src} alt="UST" width={width} height={height} className={cn("w-auto", className)} />;
}
