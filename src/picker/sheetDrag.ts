import { seatLayerPickerTokens } from './tokens.g';

/**
 * The cart sheet's detents and the physics between them (spec §3.9/§3.10.1).
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

export interface SeatLayerSheetDetentInput {
  readonly viewportHeight: number;
  /** The head this sheet holds, measured — never a second number for the bar. */
  readonly peekHeight: number;
  /** How tall the open sheet's own content wants to be. */
  readonly contentHeight: number;
  readonly bottomInset: number;
  readonly hasTickets: boolean;
}

export interface SeatLayerSheetDetents {
  readonly peek: number;
  readonly content: number;
  readonly full: number;
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The three heights the sheet may rest at, each already carrying the safe inset.
 *
 * THE BAR IS EXACTLY ITS HEAD: `peek` is the measured head plus the lift plus
 * the inset, never a second clip number, or the head's own 44 pt buttons lose
 * their lower edge.
 */
export function seatLayerSheetDetents(input: SeatLayerSheetDetentInput): SeatLayerSheetDetents {
  const viewport = finite(input.viewportHeight);
  const inset = finite(input.bottomInset);
  const peek = finite(input.peekHeight) + seatLayerPickerTokens.size.peekClockLift + inset;
  const ceiling = input.hasTickets
    ? Math.min(
      viewport * seatLayerPickerTokens.size.sheetMaxHeightFraction,
      seatLayerPickerTokens.size.sheetMaxHeight,
    )
    : Math.min(
      viewport * seatLayerPickerTokens.size.emptyTrayMaxHeightFraction,
      seatLayerPickerTokens.size.emptyTrayMaxHeight,
    );
  const content = Math.max(peek, Math.min(finite(input.contentHeight) + inset, ceiling + inset));
  const full = Math.max(content, viewport * seatLayerPickerTokens.size.sheetFullHeightFraction);
  return Object.freeze({ peek, content, full });
}

/** The heights the sheet may settle on, low to high, with duplicates removed. */
export function seatLayerSheetStops(detents: SeatLayerSheetDetents): readonly number[] {
  return Object.freeze([...new Set([detents.peek, detents.content, detents.full])]
    .sort((left, right) => left - right));
}

/**
 * Over-drag past the top stop is resisted rather than refused: the sheet keeps
 * following the finger, but at `motion.physics.rubberBand` of its travel.
 */
export function seatLayerSheetRubberBanded(height: number, detents: SeatLayerSheetDetents): number {
  const ceiling = detents.full;
  const floor = detents.peek;
  if (height > ceiling) return ceiling + (height - ceiling) * seatLayerSheetRubberBand;
  if (height < floor) return floor - (floor - height) * seatLayerSheetRubberBand;
  return height;
}

/**
 * Where a released drag settles. Above `sheetFlingVelocity` the flick decides
 * on its own — the next stop in the direction of travel; otherwise the nearest.
 */
export function seatLayerSheetSettle(
  height: number,
  velocity: number,
  detents: SeatLayerSheetDetents,
): number {
  const stops = seatLayerSheetStops(detents);
  const current = typeof height === 'number' && Number.isFinite(height) ? height : stops[0]!;
  const speed = typeof velocity === 'number' && Number.isFinite(velocity) ? velocity : 0;
  if (Math.abs(speed) >= seatLayerSheetFlingVelocity) {
    // Positive velocity grows the sheet.
    const ordered = speed > 0 ? stops : [...stops].reverse();
    const next = ordered.find((stop) => speed > 0 ? stop > current : stop < current);
    if (next !== undefined) return next;
  }
  return stops.reduce((best, stop) =>
    Math.abs(stop - current) < Math.abs(best - current) ? stop : best, stops[0]!);
}

/** Which named detent a settled height is. */
export function seatLayerSheetDetentAt(
  height: number,
  detents: SeatLayerSheetDetents,
): SeatLayerSheetDetent {
  if (height >= detents.full) return 'full';
  if (height > detents.peek) return 'content';
  return 'peek';
}
