/** Captures cleanup from one renderer effect setup, not a later render. */
export function captureSeatLayerRendererUnmount(
  callback: (() => void) | undefined,
): () => void {
  return () => {
    if (callback === undefined) return;
    try {
      void Promise.resolve(callback()).catch(() => undefined);
    } catch {
      // Cleanup still completes when a host notification fails.
    }
  };
}
