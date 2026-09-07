import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => {} }) },
}));

let scope: Record<string, unknown>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));

import { SeatLayerPickerHaptics } from '../src/picker/SeatLayerPickerHaptics';
import { SeatLayerPickerReducedMotionStore, useSeatLayerPickerReducedMotion, type SeatLayerPickerReducedMotionSource } from '../src/picker/reducedMotion';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve };
}

function MotionProbe({ store, values }: { readonly store: SeatLayerPickerReducedMotionStore; readonly values: boolean[] }): null {
  values.push(useSeatLayerPickerReducedMotion(store)); return null;
}

function hapticSnapshot(selection = 0, focus: string | undefined = undefined, hold = false) {
  return { selection: Array.from({ length: selection }, (_, id) => ({ id: `${id}` })), map: { focusedSectionId: focus }, hold: { active: hold } };
}

describe('picker reduced-motion store', () => {
  it('reads initial state, follows live changes, and ignores an old initial result after cleanup', async () => {
    const first = deferred<boolean>(); const second = deferred<boolean>(); const listeners: Array<(enabled: boolean) => void> = []; const removals: number[] = [];
    let reads = 0;
    const source: SeatLayerPickerReducedMotionSource = {
      isReduceMotionEnabled: () => (++reads === 1 ? first.promise : second.promise),
      addEventListener: (_event, listener) => { listeners.push(listener); return { remove: () => removals.push(listeners.indexOf(listener)) }; },
    };
    const store = new SeatLayerPickerReducedMotionStore(source); const values: boolean[] = [];
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(MotionProbe, { store, values })); });
    await act(async () => { renderer!.unmount(); });
    first.resolve(true); await act(async () => { await Promise.resolve(); });
    expect(removals).toEqual([0]); expect(values).toEqual([false]);
    await act(async () => { renderer = create(React.createElement(MotionProbe, { store, values })); second.resolve(false); await Promise.resolve(); });
    await act(async () => { listeners[1]!(true); });
    expect(values).toEqual([false, false, true]);
    await act(async () => { renderer!.unmount(); });
    expect(removals).toEqual([0, 1]);
  });

  it('does not let an initial read overwrite a newer native observation', async () => {
    const initial = deferred<boolean>(); const listeners: Array<(enabled: boolean) => void> = []; const values: boolean[] = [];
    const source: SeatLayerPickerReducedMotionSource = {
      isReduceMotionEnabled: () => initial.promise,
      addEventListener: (_event, listener) => { listeners.push(listener); return { remove: () => {} }; },
    };
    const store = new SeatLayerPickerReducedMotionStore(source);
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(MotionProbe, { store, values })); });
    await act(async () => { listeners[0]!(true); });
    initial.resolve(false);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { (listeners[0] as unknown as (value: unknown) => void)('invalid'); });
    expect(values).toEqual([false, true]);
    await act(async () => { renderer!.unmount(); });
  });

  it('keeps an initial read eligible when a malformed native payload arrives first', async () => {
    const initial = deferred<boolean>(); const listeners: Array<(enabled: boolean) => void> = []; const values: boolean[] = [];
    const source: SeatLayerPickerReducedMotionSource = {
      isReduceMotionEnabled: () => initial.promise,
      addEventListener: (_event, listener) => { listeners.push(listener); return { remove: () => {} }; },
    };
    const store = new SeatLayerPickerReducedMotionStore(source);
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(MotionProbe, { store, values })); });
    await act(async () => { (listeners[0] as unknown as (value: unknown) => void)({ enabled: false }); });
    initial.resolve(true);
    await act(async () => { await Promise.resolve(); });
    expect(values).toEqual([false, true]);
    await act(async () => { renderer!.unmount(); });
  });
});

describe('picker scoped haptics', () => {
  it('seeds silently, dedupes transitions, accepts only explicit expiry, and quarantines replacements', async () => {
    const signals = new Set<() => void>(); const calls: string[] = []; let rejectLate!: (error: Error) => void;
    const late = new Promise<void>((_resolve, reject) => { rejectLate = reject; });
    const mapController = { on: (_name: 'holdExpired', listener: () => void) => { signals.add(listener); return () => signals.delete(listener); } };
    const adapter = { play: async (strength: string) => { calls.push(strength); if (strength === 'heavy') await late; } };
    scope = { controller: { mapController }, sessionId: 1, snapshot: hapticSnapshot() };
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerHaptics, { adapter })); });
    expect(calls).toEqual([]);
    scope.snapshot = hapticSnapshot(1, 'A', true);
    await act(async () => { renderer!.update(React.createElement(SeatLayerPickerHaptics, { adapter })); await Promise.resolve(); });
    expect(calls).toEqual(['selection', 'selection', 'medium']);
    for (const signal of signals) signal();
    await act(async () => { await Promise.resolve(); });
    expect(calls).toEqual(['selection', 'selection', 'medium', 'heavy']);
    for (const signal of signals) signal();
    await act(async () => { await Promise.resolve(); });
    expect(calls).toHaveLength(4);
    scope.snapshot = hapticSnapshot(1, 'A', false);
    await act(async () => { renderer!.update(React.createElement(SeatLayerPickerHaptics, { adapter })); await Promise.resolve(); });
    expect(calls).toHaveLength(4);
    scope = { ...scope, sessionId: 2, snapshot: hapticSnapshot(1, 'A', true) };
    await act(async () => { renderer!.update(React.createElement(SeatLayerPickerHaptics, { adapter })); rejectLate(new Error('late')); await Promise.resolve(); });
    expect(signals.size).toBe(1); expect(calls).toHaveLength(4);
    await act(async () => { renderer!.unmount(); });
    expect(signals.size).toBe(0);
  });

  it('silently seeds an identical snapshot for every adapter or session generation', async () => {
    const firstSignals = new Set<() => void>(); const secondSignals = new Set<() => void>();
    const firstCalls: string[] = []; const secondCalls: string[] = [];
    const firstController = { mapController: { on: (_name: 'holdExpired', listener: () => void) => { firstSignals.add(listener); return () => firstSignals.delete(listener); } } };
    const secondController = { mapController: { on: (_name: 'holdExpired', listener: () => void) => { secondSignals.add(listener); return () => secondSignals.delete(listener); } } };
    const steadySnapshot = hapticSnapshot();
    const firstAdapter = { play: (strength: string) => { firstCalls.push(strength); } };
    const secondAdapter = { play: (strength: string) => { secondCalls.push(strength); } };
    scope = { controller: firstController, sessionId: 1, snapshot: steadySnapshot };
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerHaptics, { adapter: firstAdapter })); });
    scope = { controller: secondController, sessionId: 2, snapshot: steadySnapshot };
    await act(async () => { renderer!.update(React.createElement(SeatLayerPickerHaptics, { adapter: secondAdapter })); });
    expect(firstCalls).toEqual([]); expect(secondCalls).toEqual([]); expect(firstSignals.size).toBe(0); expect(secondSignals.size).toBe(1);
    scope = { ...scope, snapshot: hapticSnapshot(1) };
    await act(async () => { renderer!.update(React.createElement(SeatLayerPickerHaptics, { adapter: secondAdapter })); await Promise.resolve(); });
    expect(secondCalls).toEqual(['selection']);
    await act(async () => { renderer!.unmount(); });
  });
});
