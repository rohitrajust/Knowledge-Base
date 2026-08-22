import { PageFade } from "@/components/ui/PageFade";

// Remounts (and thus replays the entrance fade) on first-segment navigation;
// see components/ui/PageFade.tsx for why this is entrance-only.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageFade>{children}</PageFade>;
}
