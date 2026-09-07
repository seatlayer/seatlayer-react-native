import { seatLayerPickerTokens } from './tokens.g';

/**
 * What the hold pill's live region says, and how often (spec §4.10).
 *
 * `m:ss` read aloud is a time of day, and a live region fed a running clock
 * speaks once a second for a quarter of an hour. So the pill announces
 * `strings.holdMinutesLeft` at each minute mark, and `strings.holdSecondsLeft`
 * for every second of the last minute, where the buyer is owed the count.
 * Unchanged text is not re-announced, so THE THROTTLE IS THE POLICY.
 */

/** `is-expiring` begins at one minute remaining (spec §3.13.6). */
export const seatLayerHoldExpiringSeconds = 60;

export interface SeatLayerHoldAnnouncement {
  readonly key: 'holdMinutesLeft' | 'holdSecondsLeft';
  readonly count: number;
}

/**
 * The announcement owed at `remainingSeconds`, or null where the clock has
 * moved but the sentence has not.
 */
export function seatLayerHoldAnnouncementFor(remainingSeconds: unknown): SeatLayerHoldAnnouncement | null {
  const remaining = typeof remainingSeconds === 'number' && Number.isFinite(remainingSeconds)
    ? Math.max(0, Math.floor(remainingSeconds))
    : null;
  if (remaining === null) return null;
  if (remaining <= seatLayerHoldExpiringSeconds) {
    // Every second of the last minute, zero included: the hold has run out.
    return Object.freeze({ key: 'holdSecondsLeft', count: remaining });
  }
  // Only on the minute; every other tick repeats the sentence it already said.
  if (remaining % 60 !== 0) return null;
  return Object.freeze({ key: 'holdMinutesLeft', count: remaining / 60 });
}

/** The `m:ss` the pill draws, floored at zero, tabular. */
export function seatLayerHoldClockText(remainingSeconds: unknown): string {
  const remaining = typeof remainingSeconds === 'number' && Number.isFinite(remainingSeconds)
    ? Math.max(0, Math.floor(remainingSeconds))
    : 0;
  const minutes = Math.floor(remaining / 60);
  return `${String(minutes).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
}

/** Whether the pill has crossed into its final minute and inverts to the accent. */
export function seatLayerHoldExpiring(remainingSeconds: unknown): boolean {
  return typeof remainingSeconds === 'number' && Number.isFinite(remainingSeconds) &&
    remainingSeconds <= seatLayerHoldExpiringSeconds;
}

/**
 * The pill is drawn for as long as a live hold exists, WHOEVER owns it
 * (spec §3.1/§4.8, owner call 2026-09-05). The buyer's time is running on a
 * hold handed to the host exactly as it is on the picker's own, and the header
 * is the one place the picker states it. Ownership still governs what the
 * native controls may DO with the hold — no extend, no release from a cart row
 * (§4.8) — it just no longer governs whether the clock is legible. A host that
 * draws its own clock turns this one off with the `showHoldPill` option.
 */
export function seatLayerHoldPillDrawn(
  hold: Readonly<{ active?: boolean; expiresAt?: number; owner?: string }> | undefined,
  holdLapsed = false,
): boolean {
  return hold?.active === true && typeof hold.expiresAt === 'number' &&
    Number.isFinite(hold.expiresAt) && !holdLapsed;
}

export const seatLayerHoldPillHeight = seatLayerPickerTokens.size.headerCloseSize;
