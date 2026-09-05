import { seatLayerPickerTokens } from './tokens.g';

/**
 * When a swipe on a cart row becomes a removal (spec §3.10.2).
 *
 * The row settles from the finger and commits past
 * `motion.physics.swipeCommitFraction` of its own width, or above
 * `motion.physics.swipeFlingVelocity` — a throw is the same instruction given
 * faster. Both numbers are tokens; nothing here is transcribed.
 */
export const seatLayerCartSwipeCommitFraction =
  seatLayerPickerTokens.motion.physics.swipeCommitFraction;
export const seatLayerCartSwipeFlingVelocity =
  seatLayerPickerTokens.motion.physics.swipeFlingVelocity;

export interface SeatLayerCartSwipeInput {
  /** Travel toward the remove edge, in points. Always positive. */
  readonly travel: number;
  /** The row's own width, in points. */
  readonly width: number;
  /** Points per second toward the remove edge. */
  readonly velocity: number;
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** How far the row has been pushed, clamped to its own width. */
export function seatLayerCartSwipeTravel(offset: unknown, width: unknown): number {
  const limit = Math.max(0, finite(width));
  return Math.min(limit, Math.max(0, finite(offset)));
}

export function seatLayerCartSwipeCommits(input: SeatLayerCartSwipeInput): boolean {
  const width = Math.max(0, finite(input.width));
  const travel = seatLayerCartSwipeTravel(input.travel, width);
  if (finite(input.velocity) >= seatLayerCartSwipeFlingVelocity && travel > 0) return true;
  return width > 0 && travel >= width * seatLayerCartSwipeCommitFraction;
}
