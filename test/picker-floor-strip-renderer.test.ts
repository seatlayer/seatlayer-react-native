import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value },
}));
let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));

import { SeatLayerFloorStrip } from '../src/picker/SeatLayerFloorStrip';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';

function snapshot(floors: readonly { id: string; name: string }[], overrides: Partial<SeatLayerPickerSnapshot['map']> = {}): SeatLayerPickerSnapshot {
  return {
    schema: 'seatlayer.picker.snapshot/1', sessionId: 'runtime', revision: 1,
    event: { key: 'event', name: 'Event', mode: 'sale', currency: 'USD', salesClosed: false }, branding: { attributionRequired: false }, categories: [], zones: [], sections: [], bestAvailableZones: [], generalAdmissionAreas: [],
    map: { rung: 'overview', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'orbit', colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true, categoryFilter: [], accessibilityFilter: [], floors, activeFloorId: floors[0]?.id, floorMode: 'single', ...overrides },
    selection: [], maxSelection: 4, ticketCount: 0, cartLines: [], cartTotal: 0, currency: 'USD', hold: { active: false }, accessConfigured: true, accessStatus: 'available', capabilities: [], raw: null,
  };
}
function setup(value = snapshot([{ id: 'stalls', name: 'Stalls' }, { id: 'circle', name: 'Dress circle' }, { id: 'gallery', name: 'Gallery' }])) {
  let current = value; const calls: unknown[][] = []; const errors: unknown[] = []; const callbacks: string[] = []; const insetCalls: string[] = [];
  let stack = true; let command = true; let resolve!: () => void;
  const controller = {
    getSnapshot: () => current,
    mapController: { isReady: true, supportsPickerCapability: (name: string) => name === 'floor-stack-v1' && stack, supportsPickerCommand: (name: string) => name === 'picker.setFloor' && command },
    setFloor: (floorId: string) => { calls.push([floorId]); return new Promise<void>((done) => { resolve = done; }); },
  };
  const publish = () => { scope = {
    controller, snapshot: current, sessionId: 1, isBusy: false, readOnly: false, styles: {},
    strings: { translate: (key: string) => key === 'allFloors' ? 'All floors' : key },
    resolvedTheme: { colors: { surface: '#fff', text: '#111', accent: '#06f', onAccent: '#fff', divider: '#ccc' }, radii: { chip: 999 }, fontFamily: 'Brand' },
    claimViewportInsetBand: () => ({ set: ({ top }: { top?: number }) => insetCalls.push(`set:${top}`), remove: () => insetCalls.push('remove') }), reportError: (error: unknown) => errors.push(error),
  }; };
  publish();
  return {
    calls, errors, callbacks, insetCalls, resolve: () => resolve(),
    update: (next: SeatLayerPickerSnapshot) => { current = next; publish(); },
    setStack: (next: boolean) => { stack = next; publish(); }, setCommand: (next: boolean) => { command = next; publish(); },
    replace: () => { scope = { ...scope, controller: { ...controller } }; },
  };
}

describe('SeatLayerFloorStrip', () => {
  it('renders nothing for no/one floor and preserves authored multi-floor labels in order', async () => {
    const runtime = setup(snapshot([])); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerFloorStrip)); });
    expect(renderer.toJSON()).toBeNull();
    runtime.update(snapshot([{ id: 'ground', name: 'Ground' }]));
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip)); });
    expect(renderer.toJSON()).toBeNull();
    runtime.update(snapshot([{ id: 'a', name: 'A very long authored floor label' }, { id: 'b', name: 'Upper' }]));
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip)); });
    expect(renderer.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toEqual(['All floors', 'A very long authored floor label', 'Upper']);
    expect(renderer.root.findAllByType('Text' as any)[1]!.props.numberOfLines).toBe(1);
  });

  it('uses exact floor and all sentinels only when their runtime gates permit them', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerFloorStrip)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Gallery' }).props.onPress(); });
    expect(runtime.calls).toEqual([['gallery']]); runtime.resolve();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'All floors' }).props.onPress(); });
    expect(runtime.calls).toEqual([['gallery'], ['all']]); runtime.resolve();
    await act(async () => { await Promise.resolve(); });
    runtime.setStack(false);
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip)); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'All floors' })).toHaveLength(0);
    runtime.setCommand(false);
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip)); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Gallery' }).props.accessibilityState.disabled).toBe(true);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Gallery' }).props.accessibilityState.busy).toBe(false);

    runtime.setCommand(true); runtime.setStack(true);
    runtime.update(snapshot([{ id: 'stalls', name: 'Stalls' }, { id: 'circle', name: 'Circle' }], { floorMode: undefined }));
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip)); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'All floors' })).toHaveLength(0);
    runtime.update(snapshot([{ id: 'stalls', name: 'Stalls' }, { id: 'circle', name: 'Circle' }], { floorMode: 'mystery' }));
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip)); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'All floors' })).toHaveLength(0);
    runtime.update(snapshot([{ id: 'stalls', name: 'Stalls' }, { id: 'circle', name: 'Circle' }], { floorMode: 'all' }));
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip)); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'All floors' }).props.accessibilityState.selected).toBe(true);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stalls' }).props.accessibilityState.disabled).toBe(false);
  });

  it('contains rejection and retires an old completion after replacement while retaining 44dp targets', async () => {
    const runtime = setup(); let reject!: (error: Error) => void; let renderer!: ReactTestRenderer;
    scope.controller.setFloor = () => new Promise<void>((_, fail) => { reject = fail; });
    await act(async () => { renderer = create(React.createElement(SeatLayerFloorStrip)); });
    const stale = renderer.root.findByProps({ accessibilityLabel: 'Gallery' }).props.onPress;
    await act(async () => { stale(); });
    runtime.replace();
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip)); });
    await act(async () => { reject(new Error('retired')); });
    expect(runtime.errors).toEqual([]);
    const gallery = renderer.root.findByProps({ accessibilityLabel: 'Gallery' });
    expect(gallery.props.style.minHeight).toBe(44);
    expect(gallery.props.style.minWidth).toBe(44);
  });

  it('installs a flight before a reentrant floor callback can repeat the command', async () => {
    const runtime = setup(); let press!: () => void; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerFloorStrip, { onFloorChanged: () => { press(); } })); });
    press = renderer.root.findByProps({ accessibilityLabel: 'Gallery' }).props.onPress;
    await act(async () => { press(); });
    runtime.resolve();
    await act(async () => { await Promise.resolve(); });
    expect(runtime.calls).toEqual([['gallery']]);
  });

  it('observes the requested floor once when its authoritative snapshot arrives before the command reply', async () => {
    const runtime = setup(); const observed: string[] = []; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerFloorStrip, { onFloorChanged: (floor) => { observed.push(floor); } })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Gallery' }).props.onPress(); });
    runtime.update(snapshot([{ id: 'stalls', name: 'Stalls' }, { id: 'gallery', name: 'Gallery' }], { activeFloorId: 'gallery' }));
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip, { onFloorChanged: (floor) => { observed.push(floor); } })); runtime.resolve(); });
    expect(observed).toEqual(['gallery']);
  });

  it('reports a rejected action once while its exact lease is still current', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    scope.controller.setFloor = async () => { throw new Error('current rejection'); };
    await act(async () => { renderer = create(React.createElement(SeatLayerFloorStrip)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Gallery' }).props.onPress(); });
    expect(runtime.errors).toHaveLength(1);
  });

  it('publishes the fixed inset band and removes an old lease on runtime-session replacement', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerFloorStrip, { reserveInset: true })); });
    expect(runtime.insetCalls).toContain('set:44');
    runtime.update(snapshot([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { floorMode: 'single' }));
    (scope.snapshot as any).sessionId = 'replacement';
    await act(async () => { renderer.update(React.createElement(SeatLayerFloorStrip, { reserveInset: true })); });
    expect(runtime.insetCalls).toContain('remove');
  });
});
