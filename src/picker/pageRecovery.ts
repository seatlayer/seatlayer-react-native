import { SeatLayerError } from '../errors';

/** Two pages the system ended inside this window are replaced; a third is not. */
export const seatLayerPickerPageRecoveryWindowMs = 60_000;
export const seatLayerPickerPageRecoveryLimit = 2;

/**
 * Counts the pages the system ended, so a page that cannot stay up ends in the
 * error view with its Try again and not in a reload that never stops.
 */
export class SeatLayerPickerPageRecovery {
  private recent: number[] = [];

  /** Answers whether this loss may be answered with a reload. */
  lost(now: number): boolean {
    this.recent = this.recent.filter((at) => now - at < seatLayerPickerPageRecoveryWindowMs);
    this.recent.push(now);
    return this.recent.length <= seatLayerPickerPageRecoveryLimit;
  }

  reset(): void {
    this.recent = [];
  }
}

/** The hold a replaced page is asked to take up again. */
export interface SeatLayerPickerReloadHold {
  readonly event: string;
  readonly holdId: string | undefined;
}

/** How long after a resume nobody answered it is asked once more. */
export const seatLayerPickerResumeRetryMs = 2_000;

/** A failure the server did not answer: no network, a time-out, a lost page. */
export function seatLayerPickerUnanswered(error: unknown): boolean {
  if (!(error instanceof SeatLayerError)) return false;
  if (error.code === 'sl_timeout' || error.code === 'sl_transport') return true;
  // The page gives its own code to a request that failed on the way; whatever
  // the server answered carries its status.
  return error.code === 'command_failed' && typeof error.details?.meta?.status !== 'number';
}
