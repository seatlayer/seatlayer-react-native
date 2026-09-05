import { describe, expect, it } from 'vitest';

import {
  seatLayerPickerAccessPanel,
  seatLayerPickerHoldExpiredToast,
  seatLayerPickerHoldLapseTelling,
  seatLayerPickerHoldLapseToast,
  seatLayerPickerPluralKey,
  seatLayerPickerSalesClosedToast,
  seatLayerPickerSeatTakenToast,
  seatLayerPickerSeatsTakenToast,
  seatLayerPickerToastDwellMs,
} from '../src/picker/buyerStates';
import { isSeatLayerPickerSnapshotEmpty, isSeatLayerPickerSoldOut } from '../src/picker/emptyState';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const strings = seatLayerPickerTokens.strings;

function snapshot(extra: Record<string, unknown> = {}): any {
  return {
    capabilities: [],
    categories: [],
    generalAdmissionAreas: [],
    selection: [],
    cartLines: [],
    accessConfigured: false,
    accessStatus: 'public',
    event: { salesClosed: false },
    branding: {},
    ...extra,
  };
}

function lapse(lapsed: readonly string[], recoverable: readonly string[]): any {
  return { key: 'k1', lapsedLabels: lapsed, recoverableLabels: recoverable };
}

describe('§3.13.5 sold out', () => {
  it('needs a seated category, every free count zero, and no GA areas', () => {
    const free = (value: number) => ({ free: value, available: value, notForSale: false });
    expect(isSeatLayerPickerSoldOut(snapshot({
      capabilities: ['category-availability-v1'],
      categories: [free(0), free(0)],
    }))).toBe(true);
    expect(isSeatLayerPickerSoldOut(snapshot({
      capabilities: ['category-availability-v1'],
      categories: [free(0), free(3)],
    }))).toBe(false);
    expect(isSeatLayerPickerSoldOut(snapshot({ categories: [] }))).toBe(false);
    expect(isSeatLayerPickerSoldOut(snapshot({
      capabilities: ['category-availability-v1'],
      categories: [free(0)],
      generalAdmissionAreas: [{ id: 'ga', available: 0 }],
    }))).toBe(false);
  });

  it('treats an unreported free count as NOT KNOWN rather than zero', () => {
    expect(isSeatLayerPickerSoldOut(snapshot({
      capabilities: ['category-availability-v1'],
      // `available: 0` is what a count that has not landed looks like.
      categories: [{ available: 0, notForSale: false }],
    }))).toBe(false);
    expect(isSeatLayerPickerSoldOut(snapshot({
      categories: [{ available: 0, notForSale: false }],
    }))).toBe(true);
  });

  it('ignores a category that is not for sale', () => {
    expect(isSeatLayerPickerSoldOut(snapshot({
      capabilities: ['category-availability-v1'],
      categories: [{ free: 0, notForSale: false }, { free: 40, notForSale: true }],
    }))).toBe(true);
  });

  it('keeps the empty-tray predicate off a map the buyer is holding seats on', () => {
    expect(isSeatLayerPickerSnapshotEmpty(snapshot({
      categories: [{ available: 0, notForSale: false }],
      selection: [{ id: 'a' }],
    }))).toBe(false);
  });
});

describe('§3.13.3 access panel', () => {
  it('gives every reason exactly one action, and refresh is its own word', () => {
    const cases = [
      ['paused', 'accessPausedTitle', 'retry', 'retry'],
      ['revoked', 'accessRevokedTitle', 'accessRefresh', 'refreshAccess'],
      ['expired', 'accessExpiredTitle', 'accessRefresh', 'refreshAccess'],
      ['something-new', 'accessUnverifiedTitle', 'accessRefresh', 'refreshAccess'],
    ] as const;
    for (const [status, titleKey, actionKey, recovery] of cases) {
      const state = seatLayerPickerAccessPanel(snapshot({
        accessConfigured: true, accessStatus: status,
      }));
      expect(state).toMatchObject({ titleKey, actionKey, recovery });
    }
    expect(strings.accessRefresh).toBe('Refresh');
    expect(strings.retry).toBe('Try again');
    expect(strings.accessRefresh).not.toBe(strings.retry);
  });

  it('is absent for a public or granted chart', () => {
    expect(seatLayerPickerAccessPanel(snapshot())).toBeUndefined();
    expect(seatLayerPickerAccessPanel(snapshot({
      accessConfigured: true, accessStatus: 'granted',
    }))).toBeUndefined();
  });
});

describe('§3.13.7 hold expired and hold lapsed', () => {
  it('counts the some-taken telling on how many are GONE', () => {
    const telling = seatLayerPickerHoldLapseTelling(lapse(['A', 'B', 'C'], ['A']));
    expect(telling).toMatchObject({
      shape: 'someTaken',
      count: 2,
      messageKey: 'holdLapsedSomeTakenOther',
      tone: 'warning',
      actionKey: 'reselectSeatsOne',
    });
    expect(strings.holdLapsedSomeTakenOther).toContain('{count}');
  });

  it('offers no action where nothing is recoverable, and errors rather than warns', () => {
    const telling = seatLayerPickerHoldLapseTelling(lapse(['A', 'B'], []));
    expect(telling).toMatchObject({
      shape: 'noneRecoverable',
      messageKey: 'holdLapsedAllTakenOther',
      tone: 'error',
    });
    expect(telling.actionKey).toBeUndefined();
  });

  it('offers the whole set back where all of it is still free', () => {
    expect(seatLayerPickerHoldLapseTelling(lapse(['A'], ['A']))).toMatchObject({
      shape: 'allRecoverable',
      count: 1,
      messageKey: 'holdLapsedStillFreeOne',
      actionKey: 'reselectSeatsOne',
    });
  });

  it('names the recovery the toast action runs, and never invents one', () => {
    const recoverable = seatLayerPickerHoldLapseToast(lapse(['A', 'B'], ['A', 'B']));
    expect(recoverable).toMatchObject({ action: 'reselectLapsedSeats', tone: 'warning' });
    expect(seatLayerPickerHoldLapseToast(lapse(['A'], [])).action).toBeUndefined();
    expect(recoverable.key).toBe('hold-lapse:k1');
  });

  it('picks the plural form the generated tokens actually carry', () => {
    expect(seatLayerPickerPluralKey('holdMinutesLeft', 1)).toBe('holdMinutesLeftOne');
    expect(seatLayerPickerPluralKey('holdMinutesLeft', 4)).toBe('holdMinutesLeftOther');
    expect(strings.holdMinutesLeftOne).toBe('{count} minute left');
  });
});

describe('the toast payload contract', () => {
  it('carries a stable key, a token, a tone and the four-second dwell', () => {
    expect(seatLayerPickerSeatTakenToast('205-A-9')).toEqual({
      key: 'seat-taken:205-A-9',
      messageKey: 'seatJustTakenByAnother',
      tone: 'error',
      values: { label: '205-A-9' },
      dwellMs: seatLayerPickerToastDwellMs,
    });
    expect(seatLayerPickerToastDwellMs).toBe(4_000);
    expect(seatLayerPickerSeatsTakenToast().messageKey).toBe('seatsJustTaken');
    expect(seatLayerPickerSalesClosedToast()).toMatchObject({
      messageKey: 'salesClosedToast', tone: 'warning',
    });
    expect(seatLayerPickerHoldExpiredToast()).toMatchObject({
      messageKey: 'holdExpired', tone: 'warning',
    });
  });

  it('resolves every token it names against the generated English strings', () => {
    for (const key of [
      'seatJustTakenByAnother', 'seatsJustTaken', 'salesClosedToast', 'holdExpired',
      'holdLapsedStillFreeOne', 'holdLapsedSomeTakenOther', 'holdLapsedAllTakenOne',
      'reselectSeatsOne', 'reselectSeatsOther', 'mapDidNotLoad', 'reloadSeatMap',
      'soldOutEyebrow', 'soldOutTitle', 'soldOutCopy', 'allSetTitle', 'confirmedAndOnWay',
      'backToMap', 'salesClosed', 'salesClosedCopy', 'salesClosedPill', 'salesClosedCta',
    ]) {
      expect(typeof (strings as Record<string, unknown>)[key]).toBe('string');
    }
  });
});
