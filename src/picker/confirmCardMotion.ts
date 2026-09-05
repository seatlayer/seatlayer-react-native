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
