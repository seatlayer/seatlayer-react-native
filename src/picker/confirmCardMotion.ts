import { seatLayerPickerTokens } from './tokens.g';

/**
 * §3.8.4 — the seat card's moments, and the order they are allowed in.
 *
 * The ordering is the part a buyer can feel and a port can get wrong, so it
 * lives here as a plain state machine rather than inside the view: the cart,
 * the totals and every snapshot-derived surface update on the PRESS TICK, and
 * only the card's departure is sequenced behind the sweep.
 */

export type SeatLayerPickerConfirmPhase = 'entering' | 'resting' | 'committing' | 'leaving';

export interface SeatLayerPickerConfirmMotionPlan {
  /** How long the card's entrance runs; 0 under reduced motion. */
  readonly enterMs: number;
  /** How long the press sweep and its tick run; 0 under reduced motion. */
  readonly pressSweepMs: number;
  /** How long the card's exit runs; 0 under reduced motion. */
  readonly exitMs: number;
  /** When the invitation's one sweep starts, or `undefined` for never. */
  readonly inviteDelayMs?: number;
  readonly inviteSweepMs?: number;
  /** When the repeating breathe starts, or `undefined` for never. */
  readonly inviteBreatheDelayMs?: number;
  readonly inviteBreatheMs?: number;
  /** Whether a chip flies from the card to the cart at all. */
  readonly flight: boolean;
  readonly flightMs: number;
}

/**
 * Under reduced motion the invitation never starts, the sweep and tick do not
 * play, the flight chip is not created at all, and the card departs on the
 * press without waiting.
 */
export function seatLayerPickerConfirmMotionPlan(reducedMotion: boolean): SeatLayerPickerConfirmMotionPlan {
  const motion = seatLayerPickerTokens.motion;
  if (reducedMotion) {
    return Object.freeze({ enterMs: 0, pressSweepMs: 0, exitMs: 0, flight: false, flightMs: 0 });
  }
  return Object.freeze({
    enterMs: motion.duration.cardEnter,
    pressSweepMs: motion.duration.pressSweep,
    exitMs: motion.duration.exit,
    inviteDelayMs: motion.durationOutsideBudget.inviteDelay,
    inviteSweepMs: motion.durationOutsideBudget.inviteSweep,
    inviteBreatheDelayMs: motion.durationOutsideBudget.inviteBreatheDelay,
    inviteBreatheMs: motion.durationOutsideBudget.inviteBreathe,
    flight: true,
    flightMs: motion.durationOutsideBudget.confirmFlight,
  });
}

export type SeatLayerPickerConfirmMotionEvent =
  | { readonly kind: 'entered' }
  /** Any touch or key anywhere on the card, or focus on the primary button. */
  | { readonly kind: 'engaged' }
  | { readonly kind: 'press' }
  | { readonly kind: 'swept' }
  | { readonly kind: 'dismissed' };

export interface SeatLayerPickerConfirmMotionState {
  readonly phase: SeatLayerPickerConfirmPhase;
  /** Whether the invitation may still be played. */
  readonly inviting: boolean;
  /** Whether the answer has been committed to the cart yet. */
  readonly committed: boolean;
  /** Whether the primary now reads `strings.added`. */
  readonly answered: boolean;
}

export function seatLayerPickerConfirmMotionInitial(
  plan: SeatLayerPickerConfirmMotionPlan,
): SeatLayerPickerConfirmMotionState {
  return Object.freeze({
    phase: plan.enterMs > 0 ? 'entering' : 'resting',
    inviting: plan.inviteDelayMs !== undefined,
    committed: false,
    answered: false,
  });
}

/**
 * The one legal move for each event.
 *
 * The button locks on the press without losing focus, and a second press while
 * it is committing is ignored.
 */
export function seatLayerPickerConfirmMotionReduce(
  state: SeatLayerPickerConfirmMotionState,
  event: SeatLayerPickerConfirmMotionEvent,
  plan: SeatLayerPickerConfirmMotionPlan,
): SeatLayerPickerConfirmMotionState {
  switch (event.kind) {
    case 'entered':
      return state.phase === 'entering' ? Object.freeze({ ...state, phase: 'resting' }) : state;
    case 'engaged':
      return state.inviting ? Object.freeze({ ...state, inviting: false }) : state;
    case 'press': {
      if (state.phase === 'committing' || state.phase === 'leaving') return state;
      // The cart, the totals and every snapshot-derived surface update here;
      // only the departure is sequenced behind the sweep.
      const committed = Object.freeze({
        phase: plan.pressSweepMs > 0 ? 'committing' as const : 'leaving' as const,
        inviting: false,
        committed: true,
        answered: true,
      });
      return committed;
    }
    case 'swept':
      return state.phase === 'committing' ? Object.freeze({ ...state, phase: 'leaving' }) : state;
    case 'dismissed':
      return state.phase === 'leaving' ? state : Object.freeze({ ...state, inviting: false, phase: 'leaving' });
    default:
      return state;
  }
}

/** Whether a press may still be accepted at all. */
export function seatLayerPickerConfirmAcceptsPress(state: SeatLayerPickerConfirmMotionState): boolean {
  return state.phase !== 'committing' && state.phase !== 'leaving';
}

/**
 * §3.8.4 / §3.9 (0.9.1) — the ADD choreography, as its own ordering.
 *
 * Pressing `Add seat` used to do three things at once: the chip left the card,
 * the foot's count changed, and the map dropped its lift — so the seat the chip
 * was flying from slid out from under it while it was still in the air, and the
 * count had already moved by the time the chip arrived to announce it.
 *
 * The order is now fixed, and it is one thing at a time:
 *
 *  1. **press** — the answer commits (see the reducer above: the cart, the
 *     totals and every snapshot-derived surface still update on the press
 *     tick). The chip is launched from the seat and the map KEEPS its lift.
 *  2. **landed** — the chip reaches the foot's total line. Only now does the
 *     count-and-total block swell {@link seatLayerPickerConfirmSwellScale} with
 *     an accent blink, over `motion.duration.bump`.
 *  3. **released** — the swell is done and the map may put itself back.
 *
 * Under reduced motion there is no chip at all, so there is nothing to wait
 * for: the press releases the lift immediately and the foot never swells.
 *
 * **Ownership.** The stage machine is here; the chip is
 * `SeatLayerSelectionFlight` and the swell belongs to the foot, so the two
 * surfaces that draw it read `swelling` and `liftHeld` rather than timing
 * themselves off the press.
 */
export type SeatLayerPickerConfirmAddStage = 'idle' | 'flying' | 'landed' | 'released';

/** How far the count and the total swell when the chip lands. */
export const seatLayerPickerConfirmSwellScale = 1.3;

export interface SeatLayerPickerConfirmAddState {
  readonly stage: SeatLayerPickerConfirmAddStage;
  /** Whether the map must keep the pan it made for the answered seat. */
  readonly liftHeld: boolean;
  /** Whether the foot's count and total are playing their swell right now. */
  readonly swelling: boolean;
}

export type SeatLayerPickerConfirmAddEvent =
  /** `Add seat` was pressed and the answer committed. */
  | { readonly kind: 'press' }
  /** The chip reached the foot. */
  | { readonly kind: 'landed' }
  /** The swell finished. */
  | { readonly kind: 'swelled' }
  /** The card went away without an answer; nothing is owed. */
  | { readonly kind: 'dismissed' };

const idleAdd: SeatLayerPickerConfirmAddState = Object.freeze({
  stage: 'idle', liftHeld: false, swelling: false,
});
const releasedAdd: SeatLayerPickerConfirmAddState = Object.freeze({
  stage: 'released', liftHeld: false, swelling: false,
});

export function seatLayerPickerConfirmAddInitial(): SeatLayerPickerConfirmAddState {
  return idleAdd;
}

/** How long the foot's swell runs; 0 under reduced motion. */
export function seatLayerPickerConfirmSwellMs(plan: SeatLayerPickerConfirmMotionPlan): number {
  return plan.flight ? seatLayerPickerTokens.motion.duration.bump : 0;
}

export function seatLayerPickerConfirmAddReduce(
  state: SeatLayerPickerConfirmAddState,
  event: SeatLayerPickerConfirmAddEvent,
  plan: SeatLayerPickerConfirmMotionPlan,
): SeatLayerPickerConfirmAddState {
  switch (event.kind) {
    case 'press':
      if (state.stage !== 'idle') return state;
      // No chip means nothing to wait for: the map goes back on the press.
      return plan.flight
        ? Object.freeze({ stage: 'flying' as const, liftHeld: true, swelling: false })
        : releasedAdd;
    case 'landed':
      if (state.stage !== 'flying') return state;
      return Object.freeze({ stage: 'landed' as const, liftHeld: true, swelling: true });
    case 'swelled':
      return state.stage === 'landed' ? releasedAdd : state;
    case 'dismissed':
      return state.stage === 'idle' ? state : releasedAdd;
    default:
      return state;
  }
}
