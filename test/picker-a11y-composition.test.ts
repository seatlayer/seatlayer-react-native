import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ width: 320, scope: undefined as any, chartMounts: 0, accessibility: false, showToast: vi.fn(), focused: [] as number[] }));

vi.mock('react-native', () => ({
  View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {} }, useWindowDimensions: () => ({ width: state.width }),
  StatusBar: 'StatusBar',
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => undefined }),
    setAccessibilityFocus: (handle: number) => { state.focused.push(handle); },
  },
  // The test renderer has no host nodes, so a handle stands for the map region.
  findNodeHandle: (node: unknown) => (node === null || node === undefined ? null : 41),
}));
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => state.scope }));
vi.mock('../src/picker/SeatLayerPickerChart', () => ({
  SeatLayerPickerChart: (props: unknown) => { useEffect(() => { state.chartMounts += 1; }, []); return React.createElement('chart', props as object); },
}));
vi.mock('../src/picker/header', () => ({ SeatLayerPickerHeader: 'header' }));
vi.mock('../src/picker/SeatLayerPriceLegend', () => ({ SeatLayerPriceLegend: 'legend' }));
vi.mock('../src/picker/SeatLayerFloorStrip', () => ({ SeatLayerFloorStrip: 'floors' }));
vi.mock('../src/picker/SeatLayerPickerFloorSelector', () => ({ SeatLayerPickerFloorSelector: 'floor-selector' }));
vi.mock('../src/picker/SeatLayerPickerSectionNavigator', () => ({ SeatLayerPickerSectionNavigator: 'section-navigator' }));
vi.mock('../src/picker/SeatLayerMapControls', () => ({ SeatLayerMapControls: 'controls', seatLayerPickerMapControlsEdgeInset: 10 }));
vi.mock('../src/picker/accessibility', () => ({
  SeatLayerPickerAccessibilityFilters: 'accessibility',
  canRenderSeatLayerPickerAccessibilityFilters: () => state.accessibility,
}));
vi.mock('../src/picker/SeatLayerConfirmCard', () => ({ SeatLayerConfirmCard: 'confirm' }));
vi.mock('../src/picker/SeatLayerPickerSeatConfirmation', () => ({ SeatLayerPickerSeatConfirmation: 'wide-confirm' }));
vi.mock('../src/picker/SeatLayerPickerPromptTransition', () => ({
  SeatLayerPickerPromptTransition: ({ prompt }: { prompt: React.ReactNode }) => React.createElement('prompt-transition', { prompt }, prompt),
}));
vi.mock('../src/picker/SeatLayerCartSheet', () => ({ SeatLayerCartSheet: 'cart-sheet', SeatLayerBookButton: 'checkout' }));
vi.mock('../src/picker/SeatLayerCartList', () => ({ SeatLayerCartList: 'cart-list' }));
vi.mock('../src/picker/SeatLayerBestSeatsForm', () => ({ SeatLayerBestSeatsForm: 'best-seats' }));
vi.mock('../src/picker/SeatLayerPickerHaptics', () => ({ SeatLayerPickerHaptics: 'haptics' }));
vi.mock('../src/picker/SeatLayerHoldLapseNotice', () => ({ SeatLayerHoldLapseNotice: 'hold-lapse' }));
vi.mock('../src/picker/SeatLayerPickerDecisionPrompts', () => ({ SeatLayerPickerGAPrompt: 'ga-prompt', SeatLayerPickerTablePrompt: 'table-prompt' }));
vi.mock('../src/picker/SeatLayerSeatPanoramaChrome', () => ({ SeatLayerSeatPanoramaChrome: 'panorama' }));
vi.mock('../src/picker/SeatLayerVenue3DChrome', () => ({ SeatLayerVenue3DChrome: 'venue' }));
vi.mock('../src/picker/actionError', () => ({ SeatLayerPickerActionError: 'action-error' }));
vi.mock('../src/picker/status', () => ({
  SeatLayerPickerEmptyView: 'empty', SeatLayerPickerErrorView: 'error', SeatLayerPickerLoadingView: 'loading', SeatLayerPickerTestModeIndicator: 'test-badge',
}));
vi.mock('../src/picker/attribution', () => ({ SeatLayerPickerAttribution: 'attribution' }));
vi.mock('../src/picker/systemStatusBar', () => ({ SeatLayerPickerSystemStatusBar: 'system-bars' }));
vi.mock('../src/picker/scopeBackHandler', () => ({ SeatLayerPickerScopeBackHandler: 'back-handler' }));
vi.mock('../src/picker/SeatLayerDockBar', () => ({ SeatLayerDockBar: 'dock' }));
vi.mock('../src/picker/SeatLayerPickerStateOverlays', () => ({
  SeatLayerPickerSoldOutOverlay: 'sold-out', SeatLayerPickerBookedOverlay: 'booked',
}));
vi.mock('../src/picker/SeatLayerPickerAccessPanel', () => ({
  SeatLayerPickerAccessPanel: 'access-panel', SeatLayerPickerSalesClosedStatement: 'sales-closed',
}));
vi.mock('../src/picker/SeatLayerPickerAccessibleStepper', () => ({ SeatLayerPickerAccessibleStepper: 'access-stepper' }));
vi.mock('../src/picker/SeatLayerHoldOwnershipNotice', () => ({ SeatLayerHoldOwnershipNotice: 'hold-ownership' }));
vi.mock('../src/picker/SeatLayerPickerToast', () => ({
  SeatLayerPickerToastLayer: 'toast-layer',
  useSeatLayerPickerToastQueue: () => ({ queue: { current: null }, show: state.showToast }),
}));

import { SeatLayerPickerAdaptiveLayout } from '../src/picker/SeatLayerPickerAdaptiveLayout';
import { seatLayerPickerReadingOrderIds } from '../src/picker/a11y';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function scope(overrides: Record<string, unknown> = {}): any {
  const lease = { set: vi.fn(), remove: vi.fn() };
  return {
    controller: {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => undefined,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    },
    sessionId: 1, snapshot: undefined, pendingSeat: null, isReady: true, error: undefined, readOnly: false,
    presentation: { prompt: null, sheet: 'collapsed' }, setPresentation: vi.fn(),
    claimViewportInsetBand: () => lease, reportError: vi.fn(),
    resolvedTheme: { colors: { background: '#f6f7fb', surface: '#fff' } }, styles: {},
    strings: {
      translate: (key: string, options?: { values?: Record<string, string> }) => {
        const template = (seatLayerPickerTokens.strings as Record<string, string>)[key] ?? key;
        return Object.entries(options?.values ?? {})
          .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
      },
    },
    confirmPending: vi.fn(), ...overrides,
  };
}

const checkout = () => undefined;

function byId(tree: TestRenderer.ReactTestRenderer, id: string): any {
  return tree.root.find((node) => node.props.nativeID === id);
}

function snapshotWith(event?: Record<string, unknown>): any {
  return {
    revision: 1, sessionId: 'one', capabilities: [],
    map: { floors: [], activeFloorId: undefined, focusedSectionId: undefined, buyerView: 'map' },
    sections: [], categories: [], selection: [], cart: { lines: [] },
    event: event === undefined ? undefined : { key: 'e', name: 'Event', mode: 'live', currency: 'GBP', salesClosed: false, ...event },
  };
}

async function render(overrides: Record<string, unknown> = {}, width = 320): Promise<TestRenderer.ReactTestRenderer> {
  state.width = width;
  state.scope = scope(overrides);
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout }),
      // Host refs are null in the test renderer; the picker only needs a node
      // to hand to the platform's focus call.
      { createNodeMock: () => ({}) },
    );
  });
  await act(async () => {
    tree.root.find((node) => typeof node.props.testID === 'string' &&
      node.props.testID.startsWith('seatlayer-adaptive-'))
      .props.onLayout({ nativeEvent: { layout: { width, height: 720 } } });
  });
  return tree;
}

describe('§4.10 the map is one named region', () => {
  it('names the venue and says where the seats are picked', async () => {
    const tree = await render({ snapshot: snapshotWith({ venue: 'Wembley Arena', name: 'A night out' }) });
    const map = byId(tree, seatLayerPickerReadingOrderIds.map);
    expect(map.props.accessible).toBe(true);
    expect(map.props.accessibilityRole).toBe('image');
    expect(map.props.accessibilityLabel).toBe('Wembley Arena seat map');
    expect(map.props.accessibilityHint).toBe(seatLayerPickerTokens.strings.venueMapHint);
    await act(async () => { tree.unmount(); });
  });

  it('falls back to the event name, then to the generic venue view', async () => {
    const named = await render({ snapshot: snapshotWith({ name: 'A night out' }) });
    expect(byId(named, seatLayerPickerReadingOrderIds.map).props.accessibilityLabel).toBe('A night out seat map');
    await act(async () => { named.unmount(); });
    const bare = await render();
    expect(byId(bare, seatLayerPickerReadingOrderIds.map).props.accessibilityLabel)
      .toBe(`${seatLayerPickerTokens.strings.venueView} seat map`);
    await act(async () => { bare.unmount(); });
  });

  it("hides the web view's own tree behind the one node", async () => {
    const tree = await render();
    const map = byId(tree, seatLayerPickerReadingOrderIds.map);
    const inner = map.findAll((node: any) => node.props.accessibilityElementsHidden === true &&
      node.props.importantForAccessibility === 'no-hide-descendants');
    expect(inner.length).toBeGreaterThan(0);
    await act(async () => { tree.unmount(); });
  });
});

describe('§4.10 a decision surface hides the page under it', () => {
  it('leaves the header, the prices, the map, its chrome and the dock audible at rest', async () => {
    const tree = await render();
    for (const id of [seatLayerPickerReadingOrderIds.header,
      seatLayerPickerReadingOrderIds.map, seatLayerPickerReadingOrderIds.mapChrome]) {
      expect(byId(tree, id).props.accessibilityElementsHidden).toBeUndefined();
    }
    await act(async () => { tree.unmount(); });
  });

  it('hides them while a prompt owns the screen, and keeps the toast and the cart audible', async () => {
    const tree = await render({ presentation: { prompt: { kind: 'seat' }, sheet: 'collapsed' } });
    for (const id of [seatLayerPickerReadingOrderIds.header,
      seatLayerPickerReadingOrderIds.map, seatLayerPickerReadingOrderIds.mapChrome]) {
      const node = byId(tree, id);
      expect(node.props.accessibilityElementsHidden).toBe(true);
      expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    }
    const toast = byId(tree, `${seatLayerPickerReadingOrderIds.notice}-toast`);
    expect(toast.props.accessibilityElementsHidden).toBeUndefined();
    await act(async () => { tree.unmount(); });
  });
});

describe('§4.10 focus returns to the map', () => {
  it('lands on the map region when a decision surface hands the screen back', async () => {
    state.focused.length = 0;
    const tree = await render({ presentation: { prompt: { kind: 'seat' }, sheet: 'collapsed' } });
    expect(state.focused).toEqual([]);
    await act(async () => {
      state.scope = { ...state.scope, presentation: { prompt: null, sheet: 'collapsed' } };
      tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout }));
    });
    expect(state.focused).toEqual([41]);
    await act(async () => { tree.unmount(); });
  });

  it('does not grab focus on a first paint with nothing up', async () => {
    state.focused.length = 0;
    const tree = await render();
    expect(state.focused).toEqual([]);
    await act(async () => { tree.unmount(); });
  });
});

describe("§4.10 a toast's action gives focus back", () => {
  it('returns focus to the map region rather than the top of the tree', async () => {
    state.focused.length = 0;
    const tree = await render();
    const layer = tree.root.findByType('toast-layer' as any);
    expect(typeof layer.props.onFocusReturn).toBe('function');
    await act(async () => { layer.props.onFocusReturn(); });
    expect(state.focused).toEqual([41]);
    await act(async () => { tree.unmount(); });
  });
});
