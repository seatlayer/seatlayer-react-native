import { describe, expect, it } from 'vitest';

import { CartRemovalUndoCoordinator } from '../src/picker/cartRemovalUndoState';
import { cartSheetMaximumBodyHeight, projectSeatLayerCartSheet, visibleSeatLayerCartRuns } from '../src/picker/cartSheetUi';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';
import { CartSheetMeasurementCoordinator } from '../src/picker/cartSheetState';

function snapshot(lines: readonly Record<string, unknown>[]): SeatLayerPickerSnapshot {
  return {
    sessionId: 'cart', revision: 1, cartLines: lines, selection: [], categories: [],
    hold: { active: true, owner: 'picker' }, maxSelection: 8,
  } as unknown as SeatLayerPickerSnapshot;
}

describe('cart sheet projections', () => {
  it('excludes only the exact pending line and does not fake a mixed-currency total', () => {
    const result = projectSeatLayerCartSheet(snapshot([
      { lineKey: 'one', label: 'A-1', objectId: 'one', quantity: 1, unitPrice: 20, currency: 'USD' },
      { lineKey: 'two', label: 'A-2', objectId: 'two', quantity: 1, unitPrice: 30, currency: 'EUR' },
    ]), { id: 'one', label: 'A-1', objectId: 'one' });
    expect(result.confirmed.items.map((line) => line.label)).toEqual(['A-2']);
    expect(result.totals.currency).toBe('EUR');
    expect(projectSeatLayerCartSheet(snapshot([
      { lineKey: 'one', label: 'A-1', objectId: 'one', quantity: 1, unitPrice: 20, currency: 'USD' },
      { lineKey: 'two', label: 'A-2', objectId: 'two', quantity: 1, unitPrice: 30, currency: 'EUR' },
    ]), null).totals.currency).toBeNull();
  });

  it('uses the generated four-run fold and a 72 percent content cap above its peek and safe edge', () => {
    const result = projectSeatLayerCartSheet(snapshot(Array.from({ length: 6 }, (_, index) => ({
      lineKey: `line-${index}`, label: `L-${index}`, objectId: `line-${index}`, quantity: 1,
      unitPrice: 20, currency: 'USD', sectionLabel: `Section ${index}`, seatNumber: String(index),
    })) ), null);
    expect(visibleSeatLayerCartRuns(result, false)).toMatchObject({ hiddenCount: 2, canToggle: true });
    expect(cartSheetMaximumBodyHeight(1_000, 34)).toBe(628);
    expect(cartSheetMaximumBodyHeight(-10, 34)).toBe(0);
  });
});

describe('native cart undo', () => {
  it('hides immediately, opens undo only after success, and restores exact labels', () => {
    const callbacks: (() => void)[] = [];
    const undo = new CartRemovalUndoCoordinator({ setTimeout: (callback) => { callbacks.push(callback); return callback; }, clearTimeout: () => {} });
    const begin = undo.begin({ lineKey: 'one', label: 'A-1' }, 3);
    expect(begin.intent).toMatchObject({ labels: ['A-1'] });
    expect(undo.projectVisibleLines([{ lineKey: 'one', label: 'A-1' }])).toEqual([]);
    undo.acknowledgeSuccess(begin.state.active!.token);
    expect(undo.undo(begin.state.active!.token, 3).intent).toMatchObject({ objects: ['A-1'] });
    expect(callbacks).toHaveLength(1);
  });
});

describe('cart sheet measurement ownership', () => {
  it('rejects a stale layout callback when the runtime session changes in place', () => {
    const coordinator = new CartSheetMeasurementCoordinator(); const controller = {};
    const first = coordinator.begin({ controller, sessionId: 1, runtimeSessionId: 'first', expanded: true, ownsChrome: true }, 0);
    const second = coordinator.begin({ controller, sessionId: 1, runtimeSessionId: 'second', expanded: true, ownsChrome: true }, 0);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(coordinator.measure(first.revision, 300)).toBeUndefined();
  });
});
