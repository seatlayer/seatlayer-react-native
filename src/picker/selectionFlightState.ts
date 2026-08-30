/** Converts window coordinates into the ready-made picker's overlay space. */
export function planSeatLayerSelectionFlight(
  root: Readonly<{ x: number; y: number; width: number; height: number }>,
  origin: Readonly<{ x: number; y: number }>,
  bottomInset: number,
): Readonly<{ from: { x: number; y: number }; to: { x: number; y: number } }> | undefined {
  const values = [root.x, root.y, root.width, root.height, origin.x, origin.y, bottomInset];
  if (!values.every(Number.isFinite) || root.width <= 0 || root.height <= 0) return undefined;
  return Object.freeze({
    from: Object.freeze({ x: origin.x - root.x, y: origin.y - root.y }),
    to: Object.freeze({
      x: root.width / 2,
      y: Math.max(0, root.height - Math.max(0, bottomInset) - 24),
    }),
  });
}
