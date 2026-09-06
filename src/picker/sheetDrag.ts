import { seatLayerPickerTokens } from './tokens.g';

/**
 * The cart sheet's detents and the physics between them (spec §3.9/§3.10.1).
 *
 * The heights are BODY heights — the cart region above what the collapsed
 * sheet already draws — so `peek` is zero by construction. The collapsed sheet
 * is the handle, the total line, the button and the by-line; opening it lifts
 * the cart's cap, and that lift is the only thing that changes size.
 *
 * A real bottom sheet: it tracks the finger, rubber-bands past its ceiling, and
 * settles on a spring rather than a tween. Every number is a token.
 */

export type SeatLayerSheetDetent = 'peek' | 'content' | 'full';

export const seatLayerSheetSpring = Object.freeze({
  mass: seatLayerPickerTokens.motion.physics.sheetSpringMass,
  stiffness: seatLayerPickerTokens.motion.physics.sheetSpringStiffness,
  damping: seatLayerPickerTokens.motion.physics.sheetSpringDamping,
});
export const seatLayerSheetFlingVelocity =
  seatLayerPickerTokens.motion.physics.sheetFlingVelocity;
export const seatLayerSheetRubberBand = seatLayerPickerTokens.motion.physics.rubberBand;

/** Two heights are the same detent when they differ by less than this. */
export const seatLayerSheetDetentEpsilon = .5;

/**
 * How far a drag has to travel before it counts as opening or closing: the
 * accessible floor under the physics, for a buyer who moves the handle by a
 * deliberate but small amount.
 */
export const seatLayerSheetDragThreshold = 18;

/** How much of the map the sheet leaves the seat when it steps down for one. */
export const seatLayerSheetRestoreFraction = .5;

export interface SeatLayerSheetDetents {
  /** The sheet at its own content height, under the picker's ceiling. */
  readonly content: number;
  /** The tallest a finger may pull it; equal to `content` where nothing overflows. */
  readonly full: number;
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** A detent table. `full` is clamped up to `content`. */
export function seatLayerSheetDetents(
  input: Readonly<{ content: number; full: number }>,
): SeatLayerSheetDetents {
  const content = finite(input.content);
  const full = finite(input.full);
  return Object.freeze({ content, full: full < content ? content : full });
}

/** Whether `full` is a place of its own rather than a copy of `content`. */
export function seatLayerSheetOffersFull(detents: SeatLayerSheetDetents): boolean {
  return detents.full > detents.content + seatLayerSheetDetentEpsilon;
}

/** The highest detent on offer. */
export function seatLayerSheetTop(detents: SeatLayerSheetDetents): number {
  return seatLayerSheetOffersFull(detents) ? detents.full : detents.content;
}

export function seatLayerSheetHeightOf(
  detents: SeatLayerSheetDetents,
  detent: SeatLayerSheetDetent,
): number {
  if (detent === 'peek') return 0;
  if (detent === 'content') return detents.content;
  return seatLayerSheetTop(detents);
}

/** Every detent on offer, from the shortest up. */
export function seatLayerSheetOffered(
  detents: SeatLayerSheetDetents,
): readonly SeatLayerSheetDetent[] {
  return Object.freeze<SeatLayerSheetDetent[]>(
    seatLayerSheetOffersFull(detents)
      ? ['peek', 'content', 'full']
      : ['peek', 'content'],
  );
}

/** Where a released body height settles when the finger simply lets go. */
export function seatLayerSheetNearest(
  detents: SeatLayerSheetDetents,
  height: number,
): SeatLayerSheetDetent {
  let best: SeatLayerSheetDetent = 'peek';
  let bestGap = Number.POSITIVE_INFINITY;
  for (const detent of seatLayerSheetOffered(detents)) {
    const gap = Math.abs(seatLayerSheetHeightOf(detents, detent) - height);
    if (gap < bestGap) { bestGap = gap; best = detent; }
  }
  return best;
}

/**
 * Where a body height settles when the finger was still moving. A fling is an
 * instruction, not a measurement: past `sheetFlingVelocity` the sheet goes to
 * the next detent in the direction thrown even when it is nowhere near it.
 */
export function seatLayerSheetSettle(
  detents: SeatLayerSheetDetents,
  height: number,
  velocity: number,
): SeatLayerSheetDetent {
  const at = typeof height === 'number' && Number.isFinite(height) ? height : 0;
  const speed = typeof velocity === 'number' && Number.isFinite(velocity) ? velocity : 0;
  if (Math.abs(speed) < seatLayerSheetFlingVelocity) return seatLayerSheetNearest(detents, at);
  const order = seatLayerSheetOffered(detents);
  if (speed > 0) {
    for (const detent of order) {
      if (seatLayerSheetHeightOf(detents, detent) > at + seatLayerSheetDetentEpsilon) return detent;
    }
    return order[order.length - 1]!;
  }
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const detent = order[index]!;
    if (seatLayerSheetHeightOf(detents, detent) < at - seatLayerSheetDetentEpsilon) return detent;
  }
  return order[0]!;
}

/**
 * `raw`, held inside `[low, high]` by a band that gives rather than stops. A
 * hard clamp tells the buyer their finger has stopped working.
 */
export function seatLayerSheetRubberBanded(raw: number, low: number, high: number): number {
  if (!Number.isFinite(raw)) return low;
  if (raw > high) return high + (raw - high) * seatLayerSheetRubberBand;
  if (raw < low) return low - (low - raw) * seatLayerSheetRubberBand;
  return raw;
}

/**
 * The detent a drag answers with. Past the threshold a deliberate short drag
 * steps one detent in the direction of travel even where the spring would have
 * carried the sheet back to where it started.
 */
export function seatLayerSheetAnswer(
  detents: SeatLayerSheetDetents,
  from: SeatLayerSheetDetent,
  height: number,
  velocity: number,
  travel: number,
): SeatLayerSheetDetent {
  const settled = seatLayerSheetSettle(detents, height, velocity);
  if (settled !== from || Math.abs(travel) < seatLayerSheetDragThreshold) return settled;
  const order = seatLayerSheetOffered(detents);
  const next = order.indexOf(from) + (travel > 0 ? 1 : -1);
  return next >= 0 && next < order.length ? order[next]! : settled;
}
