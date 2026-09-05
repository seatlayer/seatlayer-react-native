import { describe, expect, it } from 'vitest';

import { CartRemovalMarkCoordinator } from '../src/picker/cartRemovalUndoState';
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

describe('native cart removal marks', () => {
  it('marks the pressed row, keeps it in the list, and drops the mark on the snapshot that lost it', () => {
    const marks = new CartRemovalMarkCoordinator<{ lineKey: string; label: string }>();
    const begin = marks.begin({ lineKey: 'one', label: 'A-1' }, 3);
    expect(begin.intent).toMatchObject({ labels: ['A-1'] });
    // The row stays in the tray: it is faded and inert, not hidden.
    expect(marks.isRemoving({ lineKey: 'one', label: 'A-1' })).toBe(true);
    marks.reconcile([{ lineKey: 'one', label: 'A-1' }]);
    expect(marks.isRemoving({ lineKey: 'one', label: 'A-1' })).toBe(true);
    marks.reconcile([]);
    expect(marks.isRemoving({ lineKey: 'one', label: 'A-1' })).toBe(false);
  });

  it('restores the row when the mutation fails, and refuses a second press on a marked row', () => {
    const marks = new CartRemovalMarkCoordinator<{ lineKey: string; label: string }>();
    const begin = marks.begin({ lineKey: 'one', label: 'A-1' });
    expect(marks.begin({ lineKey: 'one', label: 'A-1' }).intent).toBeNull();
    expect(marks.release(begin.mark!.token)).toBe(true);
    expect(marks.isRemoving({ lineKey: 'one', label: 'A-1' })).toBe(false);
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
