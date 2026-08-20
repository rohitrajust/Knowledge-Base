"use client";

/**
 * The ambient field every frosted surface in the app refracts.
 *
 * Glassmorphism is only legible when there is something behind the glass worth
 * blurring -- against a flat fill, `backdrop-filter` produces no visible effect
 * and the panels just read as translucent white. This paints three slow-drifting
 * teal blooms plus one warm accent behind the entire app so that blur, saturation,
 * and the tinted shadows all have something to act on.
 *
 * Implementation notes:
 * - `fixed inset-0 -z-10 pointer-events-none` puts it behind every route's content
 *   without participating in layout or hit-testing. `body`'s own background still
 *   propagates to the canvas underneath, so this stays visible while remaining a
 *   purely additive layer -- deleting this component degrades to the old flat look
 *   rather than breaking anything.
 * - Drift lives in CSS keyframes (globals.css), not Motion: it is decorative,
 *   never interactive, and must survive route changes without a React remount
 *   restarting the animation mid-cycle.
 * - The grain layer is an inline feTurbulence data URI. Large, low-contrast
 *   gradients band badly on 8-bit displays; a few percent of noise dithers the
 *   ramps and is the difference between "soft light" and "visible stripes".
 * - `prefers-reduced-motion` freezes the blobs via the `[data-aurora-blob]`
 *   rule in globals.css -- the colour field stays, only the movement stops.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        data-aurora-blob
        className="absolute -top-[20%] -left-[10%] h-[70vmax] w-[70vmax] rounded-full opacity-70 will-change-transform"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgb(53 163 171 / 0.34) 0%, rgb(53 163 171 / 0.14) 42%, rgb(53 163 171 / 0) 70%)",
          animation: "aurora-drift-a 64s ease-in-out infinite",
        }}
      />
      <div
        data-aurora-blob
        className="absolute -right-[15%] top-[8%] h-[60vmax] w-[60vmax] rounded-full opacity-60 will-change-transform"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgb(3 110 116 / 0.30) 0%, rgb(16 134 142 / 0.12) 45%, rgb(3 110 116 / 0) 72%)",
          animation: "aurora-drift-b 78s ease-in-out infinite",
        }}
      />
      <div
        data-aurora-blob
        className="absolute -bottom-[25%] left-[20%] h-[65vmax] w-[65vmax] rounded-full opacity-50 will-change-transform"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgb(168 218 222 / 0.42) 0%, rgb(110 194 200 / 0.16) 44%, rgb(168 218 222 / 0) 70%)",
          animation: "aurora-drift-c 92s ease-in-out infinite",
        }}
      />
      {/* Warm counterpoint -- keeps an all-teal field from reading as a colour cast.
          Uses UST's own accent Orange (#FC6A59) rather than an arbitrary amber, so
          this stays inside the approved brand palette. */}
      <div
        data-aurora-blob
        className="absolute bottom-[5%] right-[10%] h-[42vmax] w-[42vmax] rounded-full opacity-40 will-change-transform"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgb(252 106 89 / 0.14) 0%, rgb(252 106 89 / 0.05) 46%, rgb(252 106 89 / 0) 70%)",
          animation: "aurora-drift-b 70s ease-in-out infinite reverse",
        }}
      />
      {/* Grain: dithers the gradient ramps so they don't band on 8-bit displays. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
        }}
      />
    </div>
  );
}
