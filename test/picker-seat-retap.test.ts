import { describe, expect, it } from 'vitest';

import {
  SeatLayerPickerSeatRemovalStore,
  seatLayerPickerAcceptsSeatRetap,
} from '../src/picker/seatRetap';
import type { SelectedSeat } from '../src/types';

const seat = (id = 's1'): SelectedSeat => ({ id, label: `inv-${id}`, sectionLabel: '205', rowLabel: 'N', seatNumber: '4' });

const policy = (overrides: Partial<Parameters<typeof seatLayerPickerAcceptsSeatRetap>[1]> = {}) => ({
  readOnly: false, hasPendingAdd: false, pendingSeatIdentity: null, ...overrides,
});

function source() {
  const listeners = new Set<(value: SelectedSeat) => void>();
  return {
    listeners,
    subscribeSeatRetap: (listener: (value: SelectedSeat) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (value: SelectedSeat) => { for (const listener of [...listeners]) listener(value); },
  };
}

describe('§3.8.4a which retaps raise the question', () => {
  it('raises it for a carted seat on an ordinary picker', () => {
    expect(seatLayerPickerAcceptsSeatRetap(seat(), policy())).toBe(true);
  });

  it('never raises it on a read-only picker', () => {
    expect(seatLayerPickerAcceptsSeatRetap(seat(), policy({ readOnly: true }))).toBe(false);
  });

  it('lets an unanswered add outrank it', () => {
    expect(seatLayerPickerAcceptsSeatRetap(seat(), policy({ hasPendingAdd: true }))).toBe(false);
  });

  it('ignores a retap of the very seat an add card is already asking about', () => {
    const subject = seat();
    expect(seatLayerPickerAcceptsSeatRetap(subject, policy({
      pendingSeatIdentity: JSON.stringify([subject.id, subject.label, null]),
    }))).toBe(false);
  });

  it('refuses a seat with no structural identity at all', () => {
    expect(seatLayerPickerAcceptsSeatRetap({ id: '', label: '' } as SelectedSeat, policy())).toBe(false);
  });
});

describe('§3.8.4a the store', () => {
  it('holds the retapped seat and lets it go on dismissal', () => {
    const bus = source();
    const store = new SeatLayerPickerSeatRemovalStore(bus, policy);
    const seen: (SelectedSeat | null)[] = [];
    store.subscribe(() => seen.push(store.getSnapshot()));
    bus.emit(seat());
    expect(store.getSnapshot()?.id).toBe('s1');
    store.dismiss();
    expect(store.getSnapshot()).toBeNull();
    expect(seen).toHaveLength(2);
  });

  it('subscribes to the runtime only while a reader is listening', () => {
    const bus = source();
    const store = new SeatLayerPickerSeatRemovalStore(bus, policy);
    expect(bus.listeners.size).toBe(0);
    const stop = store.subscribe(() => undefined);
    expect(bus.listeners.size).toBe(1);
    stop();
    expect(bus.listeners.size).toBe(0);
  });

  it('drops the question when the seat leaves the selection some other way', () => {
    const bus = source();
    const store = new SeatLayerPickerSeatRemovalStore(bus, policy);
    store.subscribe(() => undefined);
    bus.emit(seat());
    store.reconcile([seat('s2')]);
    expect(store.getSnapshot()).toBeNull();
  });

  it('follows the newest snapshot’s copy of the same seat', () => {
    const bus = source();
    const store = new SeatLayerPickerSeatRemovalStore(bus, policy);
    store.subscribe(() => undefined);
    bus.emit(seat());
    const refreshed = { ...seat(), price: 60 };
    store.reconcile([refreshed]);
    expect(store.getSnapshot()?.price).toBe(60);
  });

  it('keeps pumping when one reader throws', () => {
    const bus = source();
    const store = new SeatLayerPickerSeatRemovalStore(bus, policy);
    const seen: string[] = [];
    store.subscribe(() => { throw new Error('a host reader must not break the pump'); });
    store.subscribe(() => seen.push(store.getSnapshot()?.id ?? 'none'));
    bus.emit(seat());
    expect(seen).toEqual(['s1']);
  });

  it('never raises a question the policy refuses', () => {
    const bus = source();
    const store = new SeatLayerPickerSeatRemovalStore(bus, () => policy({ readOnly: true }));
    store.subscribe(() => undefined);
    bus.emit(seat());
    expect(store.getSnapshot()).toBeNull();
  });
});
