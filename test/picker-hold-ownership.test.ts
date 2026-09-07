import { describe, expect, it } from 'vitest';

import { SeatLayerError } from '../src/errors';
import {
  SeatLayerPickerBookedDetector,
  SeatLayerPickerHoldOwnershipStore,
  seatLayerPickerHoldOwnershipCode,
  seatLayerPickerHoldOwnershipNotice,
} from '../src/picker/holdOwnership';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const handoff = Object.freeze({
  holdId: 'hold-1',
  expiresAt: 1_000,
  currency: 'EUR',
  lineItems: [],
  total: 0,
}) as any;

function snapshot(active: boolean): any {
  return { hold: { active }, revision: 1 };
}

describe('§3.13.13 seats already in checkout (N1 = B)', () => {
  it('reads all three refusals and no others', () => {
    for (const code of ['hold_owned_by_host', 'hold_selection_mismatch', 'hold_already_active']) {
      expect(seatLayerPickerHoldOwnershipCode(new SeatLayerError(code, 'x'))).toBe(code);
    }
    expect(seatLayerPickerHoldOwnershipCode(new SeatLayerError('sl_timeout', 'x'))).toBeUndefined();
    expect(seatLayerPickerHoldOwnershipCode(undefined)).toBeUndefined();
  });

  it('says the state, with Release and change seats, never the bridge sentence', () => {
    const notice = seatLayerPickerHoldOwnershipNotice(
      new SeatLayerError('hold_owned_by_host', 'Hold is owned by the host.'),
      handoff,
    );
    expect(notice).toMatchObject({
      kind: 'inCheckout',
      titleKey: 'holdInCheckoutTitle',
      bodyKey: 'holdInCheckoutBody',
      actionKey: 'releaseAndChangeSeats',
      holdId: 'hold-1',
    });
    expect(seatLayerPickerTokens.strings[notice!.titleKey])
      .toBe('Your seats are already in checkout');
    expect(seatLayerPickerTokens.strings.releaseAndChangeSeats)
      .toBe('Release and change seats');
    expect(JSON.stringify(notice)).not.toContain('Hold is owned by the host.');
  });

  it('offers nothing but dismiss for a second hold on a picker-owned one', () => {
    const notice = seatLayerPickerHoldOwnershipNotice(
      new SeatLayerError('hold_already_active', 'A hold is already active.'),
      undefined,
    );
    expect(notice).toMatchObject({
      kind: 'alreadyHeld',
      titleKey: 'holdAlreadyHeldTitle',
      bodyKey: 'holdAlreadyHeldBody',
    });
    expect(notice?.actionKey).toBeUndefined();
    expect(notice?.holdId).toBeUndefined();
  });

  it('lets a caller swallow the refusal it raised, and clears on release', () => {
    const store = new SeatLayerPickerHoldOwnershipStore();
    const seen: unknown[] = [];
    store.subscribe(() => seen.push(store.getSnapshot()));
    expect(store.raise(new SeatLayerError('sl_transport', 'x'), handoff)).toBe(false);
    expect(store.raise(new SeatLayerError('hold_selection_mismatch', 'x'), handoff)).toBe(true);
    expect(store.getSnapshot()?.kind).toBe('inCheckout');
    store.clear();
    expect(store.getSnapshot()).toBeUndefined();
    expect(seen).toHaveLength(2);
  });
});

describe('booked waits for the sale (§3.13, Flutter 0.4.0 + 0.7.1)', () => {
  it('is silent on the hand-off itself', () => {
    const detector = new SeatLayerPickerBookedDetector();
    detector.handedOff(handoff);
    expect(detector.observe(snapshot(true))).toBeUndefined();
    expect(detector.bookedHandoff).toBeUndefined();
    expect(detector.pendingHandoff).toBe(handoff);
  });

  it('answers once when the hold settles with no expiry announced', () => {
    const detector = new SeatLayerPickerBookedDetector();
    detector.handedOff(handoff);
    detector.observe(snapshot(true));
    expect(detector.observe(snapshot(false))).toBe(handoff);
    expect(detector.bookedHandoff).toBe(handoff);
    expect(detector.observe(snapshot(false))).toBeUndefined();
  });

  it('stays silent when the runtime announced the expiry first', () => {
    const detector = new SeatLayerPickerBookedDetector();
    detector.handedOff(handoff);
    detector.observe(snapshot(true));
    detector.expired();
    expect(detector.observe(snapshot(false))).toBeUndefined();
    expect(detector.bookedHandoff).toBeUndefined();
  });

  it('stays silent for a hold the buyer released back to the picker', () => {
    const detector = new SeatLayerPickerBookedDetector();
    detector.handedOff(handoff);
    detector.observe(snapshot(true));
    detector.released();
    expect(detector.observe(snapshot(false))).toBeUndefined();
  });

  it('never fires for a hold that was never handed off', () => {
    const detector = new SeatLayerPickerBookedDetector();
    detector.observe(snapshot(true));
    expect(detector.observe(snapshot(false))).toBeUndefined();
  });
});
