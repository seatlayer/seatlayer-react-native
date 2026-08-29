import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 800 }),
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1, absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
}));
let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  useSeatLayerPickerScope: () => scope,
  SeatLayerPickerScopeReprovider: ({ children }: { children: React.ReactNode }) => React.createElement('ScopeReprovider', undefined, children),
}));

import { SeatLayerPickerFloorSelector } from '../src/picker/SeatLayerPickerFloorSelector';
import { SeatLayerPickerSectionNavigator } from '../src/picker/SeatLayerPickerSectionNavigator';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';
import { I18nManager } from 'react-native';

function snapshot(overrides: Partial<SeatLayerPickerSnapshot['map']> = {}): SeatLayerPickerSnapshot {
  return {
    schema: 'seatlayer.picker.snapshot/1', sessionId: 'runtime', revision: 1,
    event: { key: 'event', name: 'Event', mode: 'sale', currency: 'USD', salesClosed: false }, branding: { attributionRequired: false }, categories: [], zones: [], bestAvailableZones: [], generalAdmissionAreas: [],
    sections: [{ id: 'stalls', label: 'Stalls' }, { id: 'balcony', label: 'A long authored balcony section label' }],
    map: { rung: 'overview', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'orbit', colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true, categoryFilter: [], accessibilityFilter: [], focusedSectionId: 'stalls', floors: [{ id: 'ground', name: 'A long authored ground-floor label' }, { id: 'upper', name: 'Upper' }], activeFloorId: 'ground', floorMode: 'single', ...overrides },
    selection: [], maxSelection: 4, ticketCount: 0, cartLines: [], cartTotal: 0, currency: 'USD', hold: { active: false }, accessConfigured: true, accessStatus: 'available', capabilities: [], raw: null,
  };
}

function setup(initial = snapshot()) {
  let current = initial;
  const focus: string[] = []; const floors: string[] = []; const errors: unknown[] = []; const callbacks: string[] = [];
  let native = true; let sectionCommand = true; let floorCommand = true; let stack = true;
  let resolveFocus!: () => void; let resolveFloor!: () => void;
  const controller = {
    getSnapshot: () => current,
    mapController: {
      isReady: true,
      supportsPickerCapability: (name: string) => native && (name === 'native-chrome-contract-v1' || name === 'floor-stack-v1' && stack),
      supportsPickerCommand: (name: string) => name === 'picker.focusSection' ? sectionCommand : name === 'picker.setFloor' ? floorCommand : false,
    },
    focusSection: (id: string) => { focus.push(id); return new Promise<void>((done) => { resolveFocus = done; }); },
    setFloor: (id: string) => { floors.push(id); return new Promise<void>((done) => { resolveFloor = done; }); },
  };
  const publish = (sessionId = 1) => {
    scope = {
      controller, snapshot: current, sessionId, isBusy: false, readOnly: true, styles: {},
      presentation: { prompt: null },
      strings: { translate: (key: string) => key === 'allFloors' ? 'All floors' : key === 'close' ? 'Close' : key },
      resolvedTheme: { colors: { surface: '#fff', background: '#eee', text: '#111', accent: '#06f', onAccent: '#fff', divider: '#ccc' }, radii: { sheet: 14 }, fontFamily: 'Brand' },
      reportError: (error: unknown) => { errors.push(error); },
      back: async () => { scope = { ...scope, presentation: { prompt: null } }; return { type: 'dismissPrompt' }; },
      claimPrompt: (_owner: string, kind: string) => {
        const lease = { owner: 'floorSelector', epoch: 1, kind };
        return { lease, open: () => { scope = { ...scope, presentation: { prompt: { kind } } }; return true; }, dismiss: () => { scope = { ...scope, presentation: { prompt: null } }; return true; } };
      },
    };
  };
  publish();
  return {
    focus, floors, errors, callbacks, resolveFocus: () => resolveFocus(), resolveFloor: () => resolveFloor(),
    update: (next: SeatLayerPickerSnapshot, session = 1) => { current = next; publish(session); },
    setNative: (value: boolean) => { native = value; publish(); }, setStack: (value: boolean) => { stack = value; publish(); }, setSectionCommand: (value: boolean) => { sectionCommand = value; publish(); }, setFloorCommand: (value: boolean) => { floorCommand = value; publish(); },
    replaceController: () => { scope = { ...scope, controller: { ...controller } }; },
  };
}

describe('wide section and floor navigation', () => {
  it('hides section navigation without a native-owned, non-seat section directory', async () => {
    const runtime = setup(snapshot({ rung: 'seats' })); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSectionNavigator)); });
    expect(renderer.toJSON()).toBeNull();
    runtime.update(snapshot({})); (scope.snapshot as any).sections = [];
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSectionNavigator)); });
    expect(renderer.toJSON()).toBeNull();
    runtime.update(snapshot()); runtime.setNative(false);
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSectionNavigator)); });
    expect(renderer.toJSON()).toBeNull();
    runtime.setNative(true); runtime.setSectionCommand(false);
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSectionNavigator)); });
    expect(renderer.toJSON()).toBeNull();
  });

  it('focuses an exact section once with selected, long-label and 44/40/8 geometry', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSectionNavigator, { onSectionFocused: (id) => { runtime.callbacks.push(id); } })); });
    const balcony = renderer.root.findByProps({ accessibilityLabel: 'A long authored balcony section label' });
    expect(balcony.props.style[1]).toEqual({ minWidth: 44, minHeight: 44 });
    expect(balcony.findByType('Text' as any).props.numberOfLines).toBe(1);
    await act(async () => { balcony.props.onPress(); balcony.props.onPress(); });
    expect(runtime.focus).toEqual(['balcony']); runtime.resolveFocus();
    await act(async () => { await Promise.resolve(); });
    expect(runtime.callbacks).toEqual(['balcony']);
    expect(balcony.findByType('View' as any).props.style.at(-1).borderRadius).toBe(8);
    (I18nManager as { isRTL: boolean }).isRTL = true;
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSectionNavigator)); });
    expect(renderer.root.findByType('ScrollView' as any).props.contentContainerStyle[1].flexDirection).toBe('row-reverse');
    (I18nManager as { isRTL: boolean }).isRTL = false;
  });

  it('retires a section failure after a scope/controller replacement', async () => {
    const runtime = setup(); let reject!: (error: Error) => void; let renderer!: ReactTestRenderer;
    scope.controller.focusSection = () => new Promise<void>((_, fail) => { reject = fail; });
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSectionNavigator)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'A long authored balcony section label' }).props.onPress(); });
    runtime.replaceController(); scope = { ...scope, sessionId: 2 };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSectionNavigator)); });
    await act(async () => { reject(new Error('retired')); });
    expect(runtime.errors).toEqual([]);
  });

  it('keeps the current section owner through the expected seats projection, but not a replacement', async () => {
    const runtime = setup(); const observed: string[] = []; let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerSectionNavigator, {
        onSectionFocused: (id) => { observed.push(id); },
      }));
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'A long authored balcony section label' }).props.onPress();
      runtime.update(snapshot({ rung: 'seats', focusedSectionId: 'balcony' }));
      renderer.update(React.createElement(SeatLayerPickerSectionNavigator, {
        onSectionFocused: (id) => { observed.push(id); },
      }));
    });
    expect(renderer.toJSON()).toBeNull();
    runtime.resolveFocus();
    await act(async () => { await Promise.resolve(); });
    expect(observed).toEqual(['balcony']);

    runtime.update(snapshot());
    await act(async () => {
      renderer.update(React.createElement(SeatLayerPickerSectionNavigator, {
        onSectionFocused: (id) => { observed.push(id); },
      }));
    });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'A long authored balcony section label' }).props.onPress(); });
    runtime.replaceController(); scope = { ...scope, sessionId: 2 };
    await act(async () => {
      renderer.update(React.createElement(SeatLayerPickerSectionNavigator, {
        onSectionFocused: (id) => { observed.push(id); },
      }));
    });
    runtime.resolveFocus();
    await act(async () => { await Promise.resolve(); });
    expect(observed).toEqual(['balcony']);
  });

  it('gates the floor selector and sends literal all only through the stack contract', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerFloorSelector)); });
    const trigger = renderer.root.findAllByProps({ accessibilityLabel: 'A long authored ground-floor label' })[0]!;
    expect(trigger.props.style[1]).toEqual({ minWidth: 44, minHeight: 44 });
    await act(async () => { trigger.props.onPress(); });
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    expect(renderer.root.findByType('ScopeReprovider' as any)).toBeTruthy();
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'All floors' }).props.onPress(); });
    expect(runtime.floors).toEqual(['all']); runtime.resolveFloor();
    await act(async () => { await Promise.resolve(); });
    runtime.setStack(false);
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'All floors' })).toHaveLength(0);
    runtime.setFloorCommand(false);
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    expect(renderer.toJSON()).toBeNull();

    const unknown = setup(snapshot({ floorMode: 'mystery' }));
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerFloorSelector)); });
    await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'A long authored ground-floor label' })[0]!.props.onPress(); renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'All floors' })).toHaveLength(0);
    expect(unknown.floors).toEqual([]);
  });

  it('keeps an edge-to-edge scrim separate from asymmetric safe floor content and backs out without a choice', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    const props = { safeAreaInsets: { top: 7, right: 19, bottom: 23, left: 3 } };
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerFloorSelector, props)); });
    await act(async () => {
      renderer.root.findAllByProps({ accessibilityLabel: 'A long authored ground-floor label' })[0]!.props.onPress();
      renderer.update(React.createElement(SeatLayerPickerFloorSelector, props));
    });
    const scrim = renderer.root.findByProps({ testID: 'seatlayer-picker-bottom-sheet-scrim' });
    const safe = renderer.root.findAllByProps({ pointerEvents: 'box-none' }).find((node) =>
      Array.isArray(node.props.style) && node.props.style.some((style: unknown) =>
        typeof style === 'object' && style !== null && (style as { paddingRight?: unknown }).paddingRight === 35,
      ),
    )!;
    expect(scrim.props.style[0]).toMatchObject({ flex: 1 });
    expect(safe.props.style[1]).toMatchObject({ paddingTop: 23, paddingRight: 35, paddingBottom: 39, paddingLeft: 19 });
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-picker-bottom-sheet-backdrop' }).props.onPress(); });
    expect(runtime.floors).toEqual([]);
    expect(scope.presentation.prompt).toBeNull();
  });

  it('backs out of the scope-owned floor modal and reports only a current rejection', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    scope.controller.setFloor = async () => { throw new Error('current floor failure'); };
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerFloorSelector)); });
    await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'A long authored ground-floor label' })[0]!.props.onPress(); });
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    const modal = renderer.root.findByType('Modal' as any);
    await act(async () => { await modal.props.onRequestClose(); renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    expect(renderer.root.findByType('Modal' as any).props.visible).toBe(false);
    await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'A long authored ground-floor label' })[0]!.props.onPress(); renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Upper' }).props.onPress(); });
    expect(runtime.errors).toHaveLength(1);
  });

  it('retires a floor completion after scope replacement and contains observer failure', async () => {
    const runtime = setup(); let reject!: (error: Error) => void; let renderer!: ReactTestRenderer;
    scope.controller.setFloor = () => new Promise<void>((_, fail) => { reject = fail; });
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerFloorSelector, { onFloorChanged: () => { throw new Error('observer'); } })); });
    await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'A long authored ground-floor label' })[0]!.props.onPress(); renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Upper' }).props.onPress(); });
    runtime.replaceController(); scope = { ...scope, sessionId: 2 };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerFloorSelector)); });
    await act(async () => { reject(new Error('retired')); });
    expect(runtime.errors).toEqual([]);
  });
});
