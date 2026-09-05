import { describe, expect, it, vi } from 'vitest';

import { CartRemovalMarkCoordinator } from '../src/picker/cartRemovalUndoState';
import {
  applyPendingConfirmationSnapshot,
  cancelPending,
  completePendingCancel,
  confirmPending,
  confirmedCartForPending,
  initialPendingConfirmationState,
  seatLayerPickerPendingConfirmationPolicy,
} from '../src/picker/pendingConfirmationState';
import { holdLapseFromOutcome, preferHoldLapse, seatLayerPickerConfiguredHoldTtl, seatLayerPickerHoldDuration } from '../src/picker/holdLapse';
import { decodeSeatLayerPickerAvailabilityOutcome } from '../src/picker/availability';
import { CartSheetMeasurementCoordinator } from '../src/picker/cartSheetState';
import { SeatLayerPickerScopeHoldLapse } from '../src/picker/scopeHoldLapse';
import { seatLayerPickerConfirmIdentity } from '../src/picker/confirmCardIdentity';
import { SeatLayerPickerPendingCancelCoordinator } from '../src/picker/pendingConfirmationActions';
import type { SeatLayerCartLineLike, SeatLayerSelectedSeatLike } from '../src/picker/cartDense';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const seat = (id: string, label: string): SeatLayerSelectedSeatLike => ({ id, label, objectId: `row-${id}` });
const line = (seatId: string, label: string, price = 25): SeatLayerCartLineLike => ({
  lineKey: `line-${seatId}`,
  label,
  objectId: `row-${seatId}`,
  objectType: 'seat',
  seatId,
  categoryKey: 'standard',
  unitPrice: price,
  currency: 'EUR',
  quantity: 1,
});

const snapshot = (sessionId: string, revision: number, selection: readonly SeatLayerSelectedSeatLike[]) => ({ sessionId, revision, selection });

describe('pending confirmation state', () => {
  it('contains a pending-cancel error observer failure without rejecting the cancellation', async () => {
    let state = applyPendingConfirmationSnapshot(
      initialPendingConfirmationState(),
      snapshot('session-1', 1, [seat('seat-1', 'A-1')]),
    );
    const reportError = vi.fn(() => { throw new Error('observer'); });
    const coordinator = new SeatLayerPickerPendingCancelCoordinator(
      { deselectObjects: vi.fn().mockRejectedValue(new Error('bridge')) },
      {
        getState: () => state,
        setState: (next) => { state = next; },
        setBusy: () => undefined,
        reportError,
      },
    );
    await expect(coordinator.cancel()).resolves.toBe(false);
    expect(reportError).toHaveBeenCalledOnce();
    expect(coordinator.isInFlight).toBe(false);
    expect(state.pending?.label).toBe('A-1');
  });

  it('keys answered selections by structural inventory identity without a select intent', () => {
    const selected = [seat('render-1', 'A-1'), seat('render-2', 'A-2')];
    const state = applyPendingConfirmationSnapshot(initialPendingConfirmationState(), snapshot('session-1', 1, selected));
    expect(state.pending?.id).toBe('render-2');
    expect(confirmedCartForPending(state, [line('render-1', 'A-1'), line('render-2', 'A-2', 30)])).toMatchObject({ quantity: 1, total: 25 });

    const confirmed = confirmPending(state);
    expect(confirmed.answered).toEqual(['["render-2","A-2","row-render-2"]']);
    expect(confirmed.pending?.id).toBe('render-1');
  });

  it('retains a cancelled pending seat until success and returns its original identity', () => {
    const state = applyPendingConfirmationSnapshot(initialPendingConfirmationState(), snapshot('session-1', 1, [seat('seat-1', 'A-1')]));
    const cancelled = cancelPending(state);
    expect(cancelled.intent).toEqual({ id: 'seat-1', label: 'A-1', objectId: 'row-seat-1', key: '["seat-1","A-1","row-seat-1"]' });
    expect(cancelled.state).toBe(state);
    expect(confirmedCartForPending(cancelled.state, [line('seat-1', 'A-1')])).toMatchObject({ quantity: 0, total: 0 });
    // A failed deselect needs no state transition: the same pending card stays.
    expect(cancelled.state.pending?.label).toBe('A-1');

    const completed = completePendingCancel(cancelled.state, cancelled.intent!);
    expect(completed.pending).toBeNull();
    expect(completed.answered).toEqual(['["seat-1","A-1","row-seat-1"]']);
  });

  it('refuses a malformed pending seat with no stable inventory label', () => {
    const state = applyPendingConfirmationSnapshot(initialPendingConfirmationState(), snapshot('session-1', 1, [
      { id: 'renderer-only', objectId: 'row-renderer-only' },
    ]));
    expect(state.pending?.id).toBe('renderer-only');
    expect(cancelPending(state)).toEqual({ state, intent: null });
  });

  it('resets sessions and ignores stale/same revisions while pruning removed seats', () => {
    let state = applyPendingConfirmationSnapshot(initialPendingConfirmationState(), snapshot('session-1', 2, [seat('seat-1', 'A-1')]));
    state = confirmPending(state);
    expect(applyPendingConfirmationSnapshot(state, snapshot('session-1', 2, [seat('different', 'B-1')]))).toBe(state);
    expect(applyPendingConfirmationSnapshot(state, snapshot('session-1', 1, [seat('different', 'B-1')]))).toBe(state);

    state = applyPendingConfirmationSnapshot(state, snapshot('session-1', 3, []));
    expect(state).toMatchObject({ answered: [], pending: null });
    state = applyPendingConfirmationSnapshot(state, snapshot('session-2', 1, [seat('seat-1', 'A-1')]));
    expect(state).toMatchObject({ answered: [], pending: { id: 'seat-1' } });
  });

  it('never creates a pending card from a live picker or host hold', () => {
    for (const owner of ['picker', 'host']) {
      const state = applyPendingConfirmationSnapshot(
        initialPendingConfirmationState(),
        { ...snapshot(`held-${owner}`, 1, [seat('seat-1', 'A-1')]), hold: { active: true, owner } },
      );
      expect(state.pending).toBeNull();
      expect(confirmedCartForPending(state, [line('seat-1', 'A-1')])).toMatchObject({ quantity: 1 });
    }
  });

  it('does not let a newly active hold answer an existing pending inspection', () => {
    const selected = [seat('seat-1', 'A-1')];
    const pending = applyPendingConfirmationSnapshot(
      initialPendingConfirmationState(),
      snapshot('session-1', 1, selected),
    );
    const held = applyPendingConfirmationSnapshot(
      pending,
      { ...snapshot('session-1', 2, selected), hold: { active: true, owner: 'picker' } },
    );

    expect(held.pending).toMatchObject({ id: 'seat-1', label: 'A-1' });
    expect(confirmedCartForPending(held, [line('seat-1', 'A-1')]))
      .toMatchObject({ quantity: 0, total: 0 });
  });

  it('keeps authoritative selection and cart projection while confirmation is disabled or read-only', () => {
    const selected = [seat('seat-1', 'A-1')];
    for (const policy of [
      seatLayerPickerPendingConfirmationPolicy({ confirmSelection: false }, false),
      seatLayerPickerPendingConfirmationPolicy({}, true),
    ]) {
      const state = applyPendingConfirmationSnapshot(
        initialPendingConfirmationState(), snapshot('session-1', 1, selected), policy,
      );
      expect(state.selection).toEqual(selected);
      expect(state.pending).toBeNull();
      expect(state.answered).toEqual([]);
      expect(confirmedCartForPending(state, [line('seat-1', 'A-1')])).toMatchObject({ quantity: 1, total: 25 });
    }
  });

  it('resets answered state for a confirmation-policy lease change without accepting an older snapshot', () => {
    const selected = [seat('seat-1', 'A-1')];
    const enabled = seatLayerPickerPendingConfirmationPolicy({}, false);
    const disabled = seatLayerPickerPendingConfirmationPolicy({ confirmSelection: false }, false);
    const answered = confirmPending(applyPendingConfirmationSnapshot(
      initialPendingConfirmationState(), snapshot('session-1', 2, selected), enabled,
    ));
    const disabledState = applyPendingConfirmationSnapshot(answered, snapshot('session-1', 2, selected), disabled);
    expect(disabledState).toMatchObject({ answered: [], pending: null, confirmationEnabled: false });
    expect(applyPendingConfirmationSnapshot(disabledState, snapshot('session-1', 1, []), enabled)).toBe(disabledState);
  });
});

describe('hold lapse merge', () => {
  it('keeps a dismissed epoch hidden, prefers richer coverage, and retires it for a newer live hold', () => {
    const coordinator = new SeatLayerPickerScopeHoldLapse();
    const rich = {
      refreshed: true, lostLabels: [], holdLapsed: true,
      lapsedLabels: ['A-2', 'A-1'], recoverableLabels: ['A-2'], revision: 4,
    } as const;
    expect(coordinator.accept(rich)?.lapsedLabels).toEqual(['A-2', 'A-1']);
    coordinator.dismiss();
    expect(coordinator.accept({ ...rich, lapsedLabels: ['A-1'] })).toBeUndefined();
    expect(coordinator.accept(rich)).toBeUndefined();
    expect(coordinator.observeSnapshot({ hold: { active: true }, revision: 5 } as never)).toBeUndefined();
    expect(coordinator.accept({ ...rich, revision: 6 })?.key).toBe('hold-lapse-2');
  });

  it('uses the accepted snapshot revision when a lapse report omits its revision', () => {
    const coordinator = new SeatLayerPickerScopeHoldLapse();
    coordinator.accept({
      refreshed: true, lostLabels: [], holdLapsed: true,
      lapsedLabels: ['A-1'], recoverableLabels: ['A-1'],
    }, undefined, 7);
    expect(coordinator.observeSnapshot({ hold: { active: true }, revision: 7 } as never)).toMatchObject({
      lapsedLabels: ['A-1'],
    });
    expect(coordinator.observeSnapshot({ hold: { active: true }, revision: 8 } as never)).toBeUndefined();
    expect(coordinator.holdLapsed).toBe(false);
  });

  it('advances the live-hold floor for an equal or thinner authoritative lapse report', () => {
    const coordinator = new SeatLayerPickerScopeHoldLapse();
    coordinator.accept({
      refreshed: true, lostLabels: [], holdLapsed: true,
      lapsedLabels: ['A-1', 'A-2'], recoverableLabels: ['A-1'], revision: 4,
    });
    coordinator.accept({
      refreshed: true, lostLabels: [], holdLapsed: true,
      lapsedLabels: ['A-1'], recoverableLabels: [], revision: 6,
    });
    expect(coordinator.observeSnapshot({ hold: { active: true }, revision: 6 } as never)).toMatchObject({
      lapsedLabels: ['A-1', 'A-2'],
    });
    expect(coordinator.holdLapsed).toBe(true);
    expect(coordinator.observeSnapshot({ hold: { active: true }, revision: 7 } as never)).toBeUndefined();
    expect(coordinator.holdLapsed).toBe(false);
  });

  it('decodes immutable recoverable labels only from safe lapsed-label data', () => {
    const decoded = decodeSeatLayerPickerAvailabilityOutcome({
      holdLapsed: true,
      lapsedLabels: ['A-1', 'A-2'],
      recoverableLabels: ['A-2', 'B-1'],
    })!;
    expect(decoded.recoverableLabels).toEqual(['A-2']);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.lapsedLabels)).toBe(true);
    expect(Object.isFrozen(decoded.recoverableLabels)).toBe(true);
    const quiet = decodeSeatLayerPickerAvailabilityOutcome({
      holdLapsed: false,
      lapsedLabels: ['A-1'],
      recoverableLabels: ['A-1'],
    })!;
    expect(quiet.lapsedLabels).toEqual([]);
    expect(quiet.recoverableLabels).toEqual([]);
    expect(Object.isFrozen(quiet.lapsedLabels)).toBe(true);
    expect(Object.isFrozen(quiet.recoverableLabels)).toBe(true);
  });

  it('contains hostile own data and array access while decoding an availability report', () => {
    const accessor = {};
    Object.defineProperty(accessor, 'holdLapsed', { get: () => { throw new Error('getter'); } });
    expect(decodeSeatLayerPickerAvailabilityOutcome(accessor)).toBeUndefined();
    const hostileLabels = new Proxy(['A-1'], { get: () => { throw new Error('array'); } });
    expect(decodeSeatLayerPickerAvailabilityOutcome({ holdLapsed: true, lapsedLabels: hostileLabels })).toMatchObject({
      holdLapsed: true, lapsedLabels: [], recoverableLabels: [],
    });
    const descriptorTrap = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('descriptor'); } });
    expect(decodeSeatLayerPickerAvailabilityOutcome(descriptorTrap)).toBeUndefined();
  });

  it('retains the exact current object for equal or thinner availability reads', () => {
    const current = Object.freeze({ key: 'epoch-1', lapsedLabels: ['A-1', 'A-2'], recoverableLabels: ['A-1'], heldForMs: 60_000, revision: 8 });
    expect(preferHoldLapse(current, { key: 'ignored', lapsedLabels: ['A-2'], recoverableLabels: [], revision: 9 })).toBe(current);
    expect(preferHoldLapse(current, { key: 'ignored', lapsedLabels: ['B-1', 'B-2'], recoverableLabels: ['B-1'], revision: 9 })).toBe(current);
  });

  it('replaces only with a strictly richer authoritative report while retaining its epoch key', () => {
    const current = { key: 'epoch-1', lapsedLabels: ['A-1'], recoverableLabels: ['A-1'], revision: 1 };
    const candidate = { key: 'runtime', lapsedLabels: ['B-1', 'B-2'], recoverableLabels: ['B-2'], heldForMs: 120_000, revision: 9 };
    const merged = preferHoldLapse(current, candidate)!;
    expect(merged).toEqual({ ...candidate, key: 'epoch-1' });
    expect(Object.isFrozen(merged)).toBe(true);
  });

  it('uses only an own, positive configured hold TTL when runtime omits it', () => {
    expect(seatLayerPickerHoldDuration(undefined, seatLayerPickerConfiguredHoldTtl({ holdTtlMs: 120000 }))).toBe(120000);
    expect(seatLayerPickerHoldDuration(60000, 120000)).toBe(60000);
    expect(seatLayerPickerConfiguredHoldTtl({ holdTtlMs: -1 })).toBeUndefined();
    expect(seatLayerPickerConfiguredHoldTtl(Object.create({ holdTtlMs: 120000 }))).toBeUndefined();
  });

  it('preserves first-seen runtime label order while trimming and deduping a lapse', () => {
    expect(holdLapseFromOutcome({
      refreshed: true,
      lostLabels: [],
      holdLapsed: true,
      lapsedLabels: [' B-2 ', 'A-1', 'B-2'],
      recoverableLabels: ['A-1', ' B-2 ', 'A-1'],
    })?.lapsedLabels).toEqual(['B-2', 'A-1']);
    expect(holdLapseFromOutcome({
      refreshed: true,
      lostLabels: [],
      holdLapsed: true,
      lapsedLabels: ['B-2', 'A-1'],
      recoverableLabels: ['A-1', 'B-2'],
    })?.recoverableLabels).toEqual(['A-1', 'B-2']);
  });
});

describe('cart visual coordinators', () => {
  it('retires an old measurement synchronously and ignores its late layout', () => {
    const coordinator = new CartSheetMeasurementCoordinator();
    const first = coordinator.begin({ controller: {}, sessionId: 1, expanded: false, ownsChrome: true }, 70);
    expect(coordinator.measure(first.revision, 90)).toBe(90);
    const next = coordinator.begin({ controller: {}, sessionId: 2, expanded: true, ownsChrome: true }, 300);
    expect(next.height).toBe(300);
    expect(coordinator.measure(first.revision, 99)).toBeUndefined();
  });

  it('formats card identity through generated templates after row normalization', () => {
    const text = (key: string, options?: { values?: Record<string, string> }) => ({
      rowIdentity: `ROW ${options?.values?.row}`,
      seatNumberIdentity: `PLACE ${options?.values?.seat}`,
      seatIdentity: `[${options?.values?.parts}]`,
    })[key] ?? key;
    expect(seatLayerPickerConfirmIdentity({ id: '1', label: 'A-7', sectionLabel: 'Orchestra', rowLabel: 'Orchestra - A', seatNumber: '7' } as never, undefined, text)).toBe('[Orchestra · ROW A · PLACE 7]');
  });
});

describe('native cart removal marks', () => {
  it('does not expose mutable mark envelopes that could corrupt later behaviour', () => {
    const coordinator = new CartRemovalMarkCoordinator();
    const begun = coordinator.begin(line('seat-1', 'A-1'));
    const mark = begun.mark! as unknown as { identity: { removalLabel: string }; labels: string[] };
    expect(() => { mark.identity.removalLabel = 'wrong'; }).toThrow();
    expect(() => { mark.labels.push('wrong'); }).toThrow();
    expect(begun.intent).toEqual({ kind: 'remove', lines: [line('seat-1', 'A-1')], labels: ['A-1'] });
  });

  it('answers the press with the row: the line stays, marked, until the snapshot loses it', () => {
    const changes: number[] = [];
    const coordinator = new CartRemovalMarkCoordinator(() => changes.push(1));
    coordinator.begin(line('seat-1', 'A-1'));
    expect(coordinator.isRemoving(line('seat-1', 'A-1'))).toBe(true);
    expect(coordinator.hasMarks).toBe(true);
    // A snapshot that still carries the line keeps the mark: the server has
    // not answered yet.
    coordinator.reconcile([line('seat-1', 'A-1')]);
    expect(coordinator.isRemoving(line('seat-1', 'A-1'))).toBe(true);
    coordinator.reconcile([]);
    expect(coordinator.isRemoving(line('seat-1', 'A-1'))).toBe(false);
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it('marks a whole run once, refuses a second press, and restores every row on failure', () => {
    const coordinator = new CartRemovalMarkCoordinator();
    const run = [line('seat-1', 'A-1'), line('seat-2', 'A-2')];
    const begun = coordinator.beginMany(run);
    expect(begun.intent?.labels).toEqual(['A-1', 'A-2']);
    expect(coordinator.isRemoving(line('seat-2', 'A-2'))).toBe(true);
    expect(coordinator.begin(line('seat-2', 'A-2')).intent).toBeNull();
    expect(coordinator.release(begun.mark!.token)).toBe(true);
    expect(coordinator.release(begun.mark!.token)).toBe(false);
    expect(coordinator.isRemoving(line('seat-1', 'A-1'))).toBe(false);
  });

  it('refuses a line the runtime cannot name, and clears every mark on reset', () => {
    const coordinator = new CartRemovalMarkCoordinator<SeatLayerCartLineLike>();
    expect(coordinator.begin({ lineKey: 'nameless' }).intent).toBeNull();
    coordinator.begin(line('seat-1', 'A-1'));
    coordinator.reset();
    expect(coordinator.hasMarks).toBe(false);
  });
});
