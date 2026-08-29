import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));

import { SeatLayerPickerCallbackObserver } from '../src/picker/SeatLayerPickerCallbackObserver';

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: 'runtime', selection: [], selectionValidity: undefined,
    hold: { active: false }, ...overrides,
  };
}

function setup(initial: Record<string, unknown> | undefined = snapshot()) {
  const callbacks = new Map<string, Set<(value: any) => void>>();
  const events: string[] = []; const reports: unknown[] = [];
  let current: Record<string, unknown> | undefined = initial;
  const controller = {
    getSnapshot: () => current,
    mapController: {
      on: (name: string, callback: (value: any) => void) => {
        const set = callbacks.get(name) ?? new Set(); set.add(callback); callbacks.set(name, set);
        return () => set.delete(callback);
      },
    },
  };
  const publish = (sessionId = 1) => {
    scope = {
      controller, snapshot: current, sessionId, resolvedTheme: { themeMode: 'light' },
      reportError: (error: unknown) => { reports.push(error); },
    };
  };
  publish();
  return {
    events, reports, controller,
    emit: (name: string, value: unknown) => { for (const callback of callbacks.get(name) ?? []) callback(value); },
    retained: (name: string) => [...(callbacks.get(name) ?? [])],
    update: (next: Record<string, unknown>, session = 1) => { current = next; publish(session); },
    replace: () => { scope = { ...scope, controller: { ...controller }, sessionId: 2 }; },
  };
}

describe('picker callback observer', () => {
  it('uses empty state as the first-snapshot baseline and resets it for a new runtime session', async () => {
    const runtime = setup(snapshot({ selection: [{ id: 'A1', tierId: 'one', label: 'A1' }] }));
    const seen: string[] = []; let renderer!: ReactTestRenderer;
    const callbacks = { onSelectionChanged: (seats: readonly { id: string }[]) => { seen.push(seats[0]!.id); } };
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerCallbackObserver, { callbacks })); });
    expect(seen).toEqual(['A1']);
    runtime.update({ ...snapshot({ selection: [{ id: 'B2', tierId: 'two', label: 'B2' }] }), sessionId: 'replacement' }, 2);
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerCallbackObserver, { callbacks })); });
    expect(seen).toEqual(['A1', 'B2']);
  });

  it('observes an unchanged snapshot again for a replacement controller lease', async () => {
    const shared = snapshot({ selection: [{ id: 'A1', tierId: 'one', label: 'A1' }] });
    const runtime = setup(shared); const seen: string[] = []; let renderer!: ReactTestRenderer;
    const callbacks = { onSelectionChanged: (seats: readonly { id: string }[]) => { seen.push(seats[0]!.id); } };
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerCallbackObserver, { callbacks })); });
    runtime.replace();
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerCallbackObserver, { callbacks })); });
    expect(seen).toEqual(['A1', 'A1']);
  });

  it('does not duplicate the initial theme when an empty runtime receives its first snapshot', async () => {
    const runtime = setup(undefined); const themes: string[] = []; let renderer!: ReactTestRenderer;
    const callbacks = { onThemeResolved: (theme: string) => { themes.push(theme); } };
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerCallbackObserver, { callbacks })); });
    runtime.update(snapshot());
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerCallbackObserver, { callbacks })); });
    expect(themes).toEqual(['light']);
  });

  it('projects snapshot state by the documented identities and scalar fields', async () => {
    const runtime = setup(); const selection: string[][] = []; const validity: number[] = []; const holds: string[] = []; const themes: string[] = [];
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerCallbackObserver, { callbacks: {
        onSelectionChanged: (seats) => { selection.push(seats.map((seat) => `${seat.id}:${seat.tierId ?? ''}`)); },
        onSelectionValidityChanged: (value) => { validity.push(value.remaining); },
        onHoldChanged: (hold) => { holds.push(hold?.owner ?? 'released'); },
        onThemeResolved: (theme) => { themes.push(theme); },
      } }));
    });
    expect(selection).toEqual([]); expect(validity).toEqual([]); expect(holds).toEqual([]); expect(themes).toEqual(['light']);
    runtime.update(snapshot({
      selection: [{ id: 'A1', tierId: 'standard', label: 'A1', price: 20 }],
      selectionValidity: { isValid: true, count: 1, required: 1, remaining: 0, seats: [], violations: [] },
      hold: { active: true, owner: 'picker', expiresAt: 99 },
    }));
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerCallbackObserver, { callbacks: {
      onSelectionChanged: (seats) => { selection.push(seats.map((seat) => `${seat.id}:${seat.tierId ?? ''}`)); },
      onSelectionValidityChanged: (value) => { validity.push(value.remaining); },
      onHoldChanged: (hold) => { holds.push(hold?.owner ?? 'released'); },
      onThemeResolved: (theme) => { themes.push(theme); },
    } })); });
    expect(selection).toEqual([['A1:standard']]); expect(validity).toEqual([0]); expect(holds).toEqual(['picker']);
    runtime.update(snapshot({
      selection: [{ id: 'A1', tierId: 'standard', label: 'renamed', price: 99 }],
      selectionValidity: { isValid: true, count: 1, required: 1, remaining: 0, seats: [], violations: ['future'] },
      hold: { active: true, owner: 'picker', expiresAt: 99 },
    }));
    scope = { ...scope, resolvedTheme: { themeMode: 'dark' } };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerCallbackObserver, { callbacks: {
      onSelectionChanged: (seats) => { selection.push(seats.map((seat) => `${seat.id}:${seat.tierId ?? ''}`)); },
      onSelectionValidityChanged: (value) => { validity.push(value.remaining); },
      onHoldChanged: (hold) => { holds.push(hold?.owner ?? 'released'); },
      onThemeResolved: (theme) => { themes.push(theme); },
    } })); });
    expect(selection).toHaveLength(1); expect(validity).toEqual([0]); expect(holds).toEqual(['picker']); expect(themes).toEqual(['light', 'dark']);
  });

  it('forwards only current raw events and contains observer failures without onError recursion', async () => {
    const runtime = setup(snapshot({ selection: [{ id: 'A1', label: 'A1' }] }));
    const access: string[] = []; const unavailable: string[] = []; const errors: string[] = [];
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerCallbackObserver, { callbacks: {
        onAccessExpired: (event) => { access.push(event.reason); },
        onSelectedObjectUnavailable: (event) => { unavailable.push(event.labels.join(',')); throw new Error('host observer'); },
        onError: (error) => { errors.push(error.code); throw new Error('do not recurse'); },
      } }));
    });
    runtime.emit('accessExpired', { reason: 'expired', refreshed: false });
    runtime.emit('selectedObjectsUnavailable', { labels: ['A1'], reason: 'taken' });
    runtime.emit('error', { code: 'runtime' });
    expect(access).toEqual(['expired']); expect(unavailable).toEqual(['A1']); expect(errors).toEqual(['runtime']);
    await act(async () => { await Promise.resolve(); });
    expect(runtime.reports).toHaveLength(1);
    const old = runtime.retained('holdExpired')[0]!;
    runtime.replace();
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerCallbackObserver, { callbacks: { onHoldExpired: () => { runtime.events.push('expired'); } } })); });
    old(undefined);
    expect(runtime.events).toEqual([]);
  });

  it('does not report an observer rejection after unmount', async () => {
    const runtime = setup(snapshot({ selection: [{ id: 'A1', label: 'A1' }] }));
    let reject!: (error: unknown) => void; let renderer!: ReactTestRenderer;
    const callbacks = { onSelectionChanged: () => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }) };
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerCallbackObserver, { callbacks })); });
    await act(async () => { renderer.unmount(); });
    reject(new Error('late'));
    await act(async () => { await Promise.resolve(); });
    expect(runtime.reports).toEqual([]);
  });
});
