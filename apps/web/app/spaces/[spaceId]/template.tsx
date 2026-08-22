import { PageFade } from "@/components/ui/PageFade";

// Keyed by the resolved [spaceId]+child segment (see Next template docs), so this
// replays the entrance fade on every in-space navigation; see
// components/ui/PageFade.tsx for why this is entrance-only.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageFade>{children}</PageFade>;
}
