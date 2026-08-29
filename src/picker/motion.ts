import { seatLayerPickerTokens } from './tokens.g';

export type SeatLayerPickerMotionEffect = keyof typeof seatLayerPickerTokens.motion.duration;
export type SeatLayerPickerMotionCurve = keyof typeof seatLayerPickerTokens.motion.curve;

export interface SeatLayerPickerResolvedMotion {
  readonly effect: SeatLayerPickerMotionEffect;
  readonly durationMs: number;
  readonly curve: typeof seatLayerPickerTokens.motion.curve[SeatLayerPickerMotionCurve];
  /** Effects with no meaningful reduced form are omitted instead of played instantly. */
  readonly skipped: boolean;
}

const noMeaningfulReducedMotionEffects: ReadonlySet<SeatLayerPickerMotionEffect> = new Set(['fly', 'stagger']);

export const seatLayerPickerMotionBudgetMs = seatLayerPickerTokens.motion.budgetMs;
export const seatLayerPickerUndoWindowMs = seatLayerPickerTokens.motion.durationOutsideBudget.undoWindow;

export function getSeatLayerPickerMotionDuration(effect: SeatLayerPickerMotionEffect): number {
  return seatLayerPickerTokens.motion.duration[effect];
}

export function getSeatLayerPickerMotionCurve(
  curve: SeatLayerPickerMotionCurve,
): typeof seatLayerPickerTokens.motion.curve[SeatLayerPickerMotionCurve] {
  return seatLayerPickerTokens.motion.curve[curve];
}

/** Throws when any animation token exceeds the generated motion budget. */
export function assertSeatLayerPickerMotionBudget(): void {
  for (const [effect, durationMs] of Object.entries(seatLayerPickerTokens.motion.duration)) {
    if (durationMs > seatLayerPickerMotionBudgetMs) {
      throw new Error(`${effect} exceeds the SeatLayer picker motion budget.`);
    }
  }
}

/** Resolves the current accessibility preference without caching it between renders. */
export function resolveSeatLayerPickerMotion(
  effect: SeatLayerPickerMotionEffect,
  reducedMotion: boolean,
  curve: SeatLayerPickerMotionCurve = 'easeEnter',
): SeatLayerPickerResolvedMotion {
  const skipped = reducedMotion && noMeaningfulReducedMotionEffects.has(effect);
  return {
    effect,
    durationMs: reducedMotion ? 0 : getSeatLayerPickerMotionDuration(effect),
    curve: getSeatLayerPickerMotionCurve(curve),
    skipped,
  };
}
