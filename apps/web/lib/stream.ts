/**
 * Batches streamed text deltas into at most one state update per animation frame.
 *
 * Token chunks can arrive far faster than React should re-render (hundreds per
 * second on a fast model); coalescing them keeps streaming smooth without ever
 * delaying the final text. `schedule`/`cancel` are injectable so tests run
 * synchronously.
 */
export function createDeltaFlusher(
  onFlush: (chunk: string) => void,
  schedule: (cb: () => void) => number = (cb) => window.requestAnimationFrame(cb),
  cancel: (handle: number) => void = (handle) => window.cancelAnimationFrame(handle),
) {
  let pending = "";
  let handle: number | null = null;

  function flush() {
    handle = null;
    const chunk = pending;
    pending = "";
    if (chunk) onFlush(chunk);
  }

  return {
    push(piece: string) {
      pending += piece;
      if (handle === null) handle = schedule(flush);
    },
    /** Immediately delivers anything still buffered (e.g. before `done` handling). */
    flushNow() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      const chunk = pending;
      pending = "";
      if (chunk) onFlush(chunk);
    },
    dispose() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
    },
  };
}
