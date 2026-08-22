"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { motionTokens } from "@/lib/motionTokens";

/**
 * Entrance-only route transition, mounted by the app's two `template.tsx` files.
 *
 * Deliberately NOT an AnimatePresence crossfade: the spaces layout carries a
 * documented post-mortem (see app/spaces/[spaceId]/layout.tsx) of a full-page
 * exit+enter transition breaking automated interaction -- the old page lingers in
 * the DOM while exiting, so fast programmatic interactions race it. Here the new
 * page is fully present and interactive from its first frame; only its opacity
 * eases in. No transform, so there is no layout shift either, and reduced-motion
 * users get an effectively instant reveal.
 */
export function PageFade({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduceMotion ? 0 : motionTokens.duration.normal,
        ease: motionTokens.easing.smooth,
      }}
    >
      {children}
    </motion.div>
  );
}
