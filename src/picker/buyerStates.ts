import type { SeatLayerPickerHoldLapse } from './holdLapse';
import type { SeatLayerPickerSnapshot } from './models';

/**
 * §3.13 buyer-facing states, as data. Every state below is a DESIGNED state,
 * not a set of disabled controls, and this module owns which one is due — the
 * surfaces that draw them (toasts, overlays, the tray) read from here so the
 * decision lives in one place rather than in each of them.
 */

export type SeatLayerPickerToastTone = 'neutral' | 'success' | 'warning' | 'error';

/**
 * The payload contract between this state machine and the toast surface.
 * `messageKey` is a string token, resolved by the drawing surface so a host
 * override still wins; `count` selects the plural form. `actionKey` is the one
 * action, at a fixed 44 pt reach.
 */
export interface SeatLayerPickerToast {
  /** Stable per occurrence: the same key never re-announces the same news. */
  readonly key: string;
  readonly messageKey: string;
  readonly tone: SeatLayerPickerToastTone;
  readonly count?: number;
  readonly values?: Readonly<Record<string, string | number>>;
  readonly actionKey?: string;
  /** Which recovery the action runs; the surface never invents one. */
  readonly action?: 'reselectLapsedSeats';
  readonly dwellMs: number;
}

/** §3.12: four seconds, and a toast is announced outright as well as being live. */
export const seatLayerPickerToastDwellMs = 4_000;

function toast(input: Omit<SeatLayerPickerToast, 'dwellMs'> & { dwellMs?: number }): SeatLayerPickerToast {
  return Object.freeze({ dwellMs: seatLayerPickerToastDwellMs, ...input });
}

/** §3.13.9. While a seat card is up this toast is the reply to the tap. */
export function seatLayerPickerSeatTakenToast(label: string): SeatLayerPickerToast {
  return toast({
    key: `seat-taken:${label}`,
    messageKey: 'seatJustTakenByAnother',
    tone: 'error',
    values: { label },
  });
}

export function seatLayerPickerSeatsTakenToast(): SeatLayerPickerToast {
  return toast({ key: 'seats-taken', messageKey: 'seatsJustTaken', tone: 'error' });
}

/** §3.13.4. Said on any attempted action while sales are closed. */
export function seatLayerPickerSalesClosedToast(): SeatLayerPickerToast {
  return toast({ key: 'sales-closed', messageKey: 'salesClosedToast', tone: 'warning' });
}

/**
 * §3.13.7. A plain expiry, deferred by one tick because a richer telling — the
 * lapse below — may cancel it.
 */
export function seatLayerPickerHoldExpiredToast(): SeatLayerPickerToast {
  return toast({ key: 'hold-expired', messageKey: 'holdExpired', tone: 'warning' });
}

export const seatLayerPickerHoldExpiryDeferMs = 1;

export type SeatLayerPickerHoldLapseShape = 'allRecoverable' | 'someTaken' | 'noneRecoverable';

/**
 * Which of the three tellings a lapse gets, counted on what the offer would
 * RE-TAKE. `someTaken` is counted on how many are GONE, not on how many are
 * left — that is the number the sentence prints.
 */
export function seatLayerPickerHoldLapseShape(
  lapse: SeatLayerPickerHoldLapse,
): Readonly<{ shape: SeatLayerPickerHoldLapseShape; count: number }> {
  const lapsed = lapse.lapsedLabels.length;
  const recoverable = lapse.recoverableLabels.length;
  if (recoverable === 0) {
    return Object.freeze({ shape: 'noneRecoverable' as const, count: Math.max(lapsed, 1) });
  }
  if (recoverable >= lapsed) {
    return Object.freeze({ shape: 'allRecoverable' as const, count: recoverable });
  }
  return Object.freeze({ shape: 'someTaken' as const, count: lapsed - recoverable });
}

const lapseCopy: Readonly<Record<SeatLayerPickerHoldLapseShape, Readonly<{
  base: string;
  tone: SeatLayerPickerToastTone;
  action: boolean;
}>>> = Object.freeze({
  allRecoverable: { base: 'holdLapsedStillFree', tone: 'warning', action: true },
  someTaken: { base: 'holdLapsedSomeTaken', tone: 'warning', action: true },
  noneRecoverable: { base: 'holdLapsedAllTaken', tone: 'error', action: false },
});

/**
 * The plural form to ask for. The generated tokens carry `…One` / `…Other`
 * rather than a `key.one` suffix, so the choice is made here instead of being
 * hidden in the resolver.
 */
export function seatLayerPickerPluralKey(
  base: string,
  count: number,
  locale?: string | null,
): string {
  let category = count === 1 ? 'one' : 'other';
  try {
    category = new Intl.PluralRules(typeof locale === 'string' && locale ? locale : 'en')
      .select(count);
  } catch {
    // A locale the platform does not know still gets English plurals.
  }
  return `${base}${category === 'one' ? 'One' : 'Other'}`;
}

export interface SeatLayerPickerHoldLapseTelling {
  readonly shape: SeatLayerPickerHoldLapseShape;
  readonly count: number;
  readonly messageKey: string;
  readonly tone: SeatLayerPickerToastTone;
  readonly actionKey?: string;
}

/**
 * The same sentence twice: a toast for a buyer looking at the map, and the
 * persistent line in the cart sheet, because a toast is gone in four seconds
 * and the tickets are what the buyer will look at. Neither blocks.
 */
export function seatLayerPickerHoldLapseTelling(
  lapse: SeatLayerPickerHoldLapse,
  locale?: string | null,
): SeatLayerPickerHoldLapseTelling {
  const { shape, count } = seatLayerPickerHoldLapseShape(lapse);
  const copy = lapseCopy[shape];
  return Object.freeze({
    shape,
    count,
    messageKey: seatLayerPickerPluralKey(copy.base, count, locale),
    tone: copy.tone,
    ...(copy.action
      ? {
        actionKey: seatLayerPickerPluralKey(
          'reselectSeats', lapse.recoverableLabels.length, locale,
        ),
      }
      : {}),
  });
}

export function seatLayerPickerHoldLapseToast(
  lapse: SeatLayerPickerHoldLapse,
  locale?: string | null,
): SeatLayerPickerToast {
  const telling = seatLayerPickerHoldLapseTelling(lapse, locale);
  return toast({
    key: `hold-lapse:${lapse.key}`,
    messageKey: telling.messageKey,
    tone: telling.tone,
    count: telling.count,
    ...(telling.actionKey
      ? { actionKey: telling.actionKey, action: 'reselectLapsedSeats' as const }
      : {}),
  });
}

export type SeatLayerPickerAccessReason = 'paused' | 'revoked' | 'expired' | 'unverified';

export interface SeatLayerPickerAccessPanelState {
  readonly reason: SeatLayerPickerAccessReason;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly actionKey: 'retry' | 'accessRefresh';
  /**
   * The paused screen keeps a plain remount: nothing is wrong with the
   * session, the organizer has simply stopped selling. Every other reason
   * re-bootstraps IN PLACE first, so the map never goes away and the buyer
   * keeps their camera and their picks.
   */
  readonly recovery: 'retry' | 'refreshAccess';
}

const accessPanels: Readonly<Record<SeatLayerPickerAccessReason, SeatLayerPickerAccessPanelState>> =
  Object.freeze({
    paused: Object.freeze({
      reason: 'paused' as const,
      titleKey: 'accessPausedTitle',
      bodyKey: 'accessPausedCopy',
      actionKey: 'retry' as const,
      recovery: 'retry' as const,
    }),
    revoked: Object.freeze({
      reason: 'revoked' as const,
      titleKey: 'accessRevokedTitle',
      bodyKey: 'accessRevokedCopy',
      actionKey: 'accessRefresh' as const,
      recovery: 'refreshAccess' as const,
    }),
    expired: Object.freeze({
      reason: 'expired' as const,
      titleKey: 'accessExpiredTitle',
      bodyKey: 'accessExpiredCopy',
      actionKey: 'accessRefresh' as const,
      recovery: 'refreshAccess' as const,
    }),
    unverified: Object.freeze({
      reason: 'unverified' as const,
      titleKey: 'accessUnverifiedTitle',
      bodyKey: 'accessUnverifiedCopy',
      actionKey: 'accessRefresh' as const,
      recovery: 'refreshAccess' as const,
    }),
  });

/**
 * §3.13.3. EVERY reason has exactly one action. Two of these used to have
 * none, which left the buyer behind a panel with nothing to press. A recovery
 * that might not work is still a way forward; a dead end is not.
 */
export function seatLayerPickerAccessPanel(
  snapshot: SeatLayerPickerSnapshot | undefined,
): SeatLayerPickerAccessPanelState | undefined {
  if (!snapshot || snapshot.accessConfigured !== true) return undefined;
  const status = snapshot.accessStatus;
  if (status === 'public' || status === 'granted' || status === 'ok') return undefined;
  const reason = status === 'paused' || snapshot.accessReason === 'paused'
    ? 'paused'
    : status === 'revoked' || snapshot.accessReason === 'revoked'
      ? 'revoked'
      : status === 'expired' || snapshot.accessReason === 'expired'
        ? 'expired'
        : 'unverified';
  return accessPanels[reason];
}

export const seatLayerPickerAccessPanels = accessPanels;
