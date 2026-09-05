import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  width: 390, scope: undefined as any, accessibility: false, showToast: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: 'View', ScrollView: 'ScrollView',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {} },
  useWindowDimensions: () => ({ width: state.width }),
  StatusBar: 'StatusBar',
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove: () => undefined }) },
}));
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => state.scope }));
vi.mock('../src/picker/SeatLayerPickerChart', () => ({ SeatLayerPickerChart: 'chart' }));
vi.mock('../src/picker/header', () => ({ SeatLayerPickerHeader: 'header' }));
vi.mock('../src/picker/SeatLayerPriceLegend', () => ({ SeatLayerPriceLegend: 'legend' }));
vi.mock('../src/picker/SeatLayerFloorStrip', () => ({ SeatLayerFloorStrip: 'floors' }));
vi.mock('../src/picker/SeatLayerPickerFloorSelector', () => ({ SeatLayerPickerFloorSelector: 'floor-selector' }));
vi.mock('../src/picker/SeatLayerPickerSectionNavigator', () => ({ SeatLayerPickerSectionNavigator: 'section-navigator' }));
vi.mock('../src/picker/SeatLayerMapControls', () => ({ SeatLayerMapControls: 'controls', seatLayerPickerMapControlsEdgeInset: 12 }));
vi.mock('../src/picker/accessibility', () => ({
  SeatLayerPickerAccessibilityFilters: 'accessibility',
  canRenderSeatLayerPickerAccessibilityFilters: () => state.accessibility,
}));
vi.mock('../src/picker/SeatLayerConfirmCard', () => ({ SeatLayerConfirmCard: 'confirm' }));
vi.mock('../src/picker/SeatLayerPickerSeatConfirmation', () => ({ SeatLayerPickerSeatConfirmation: 'wide-confirm' }));
vi.mock('../src/picker/SeatLayerPickerPromptTransition', () => ({
  SeatLayerPickerPromptTransition: (props: Record<string, unknown>) =>
    React.createElement('prompt-transition', props, props.prompt as React.ReactNode),
}));
vi.mock('../src/picker/SpotlightGlass', () => ({ SpotlightGlass: 'spotlight' }));
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
  SeatLayerPickerEmptyView: 'empty', SeatLayerPickerErrorView: 'error',
  SeatLayerPickerLoadingView: 'loading', SeatLayerPickerTestModeIndicator: 'test-badge',
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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const checkout = () => undefined;

function scope(overrides: Record<string, unknown> = {}, controllerOverrides: Record<string, unknown> = {}): any {
  const lease = { set: vi.fn(), remove: vi.fn() };
  const retap: ((seat: unknown) => void)[] = [];
  const controller: any = {
    mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
    setInteractionEnabled: vi.fn(() => Promise.resolve()),
    getGACandidate: () => undefined, subscribeGACandidate: () => () => undefined,
    getSnapshot: () => undefined,
    subscribeSeatRetap: (listener: (seat: unknown) => void) => { retap.push(listener); return () => undefined; },
    supportsFrameSeat: true,
    frameSeat: vi.fn(() => Promise.resolve({ dy: 40, gestures: 3 })),
    ...controllerOverrides,
  };
  return {
    controller, retap, lease,
    sessionId: 1, snapshot: undefined, pendingSeat: null, isReady: true, error: undefined, readOnly: false,
    presentation: { prompt: null, sheet: 'collapsed' }, setPresentation: () => undefined,
    claimViewportInsetBand: () => lease, reportError: vi.fn(),
    resolvedTheme: { colors: { background: '#f6f7fb', surface: '#fff', divider: '#e5e5e5' } },
    styles: {}, strings: { translate: (key: string) => key, locale: 'en' },
    confirmPending: vi.fn(), holdLapse: undefined, holdLapsed: false, reselectHoldLapse: vi.fn(),
    ...overrides,
  };
}

const liveSnapshot = {
  sessionId: 'runtime', revision: 3, hold: { active: false }, capabilities: [],
  categories: [{ notForSale: false }], event: { mode: 'live' },
  map: { floors: [], buyerView: 'map' }, sections: [], selection: [],
};

async function render(current: any) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout }));
  });
  const map = tree.root.findByProps({ testID: 'seatlayer-chart-owner' }).parent!;
  await act(async () => { map.props.onLayout({ nativeEvent: { layout: { height: 600, width: 390 } } }); });
  return { tree, current };
}

describe('integrated picker composition', () => {
  it('raises the remove card on a retap of a carted seat, with no pending confirmation', async () => {
    const current = scope({ snapshot: { ...liveSnapshot, selection: [{ id: 's-1', label: 'A 12' }] } });
    state.scope = current;
    const { tree } = await render(current);
    expect(tree.root.findAllByType('confirm' as any)).toHaveLength(0);
    await act(async () => { current.retap[0]({ id: 's-1', label: 'A 12' }); });
    // §3.8.4a — the same card, in its remove mode, for a seat with no pending
    // confirmation at all.
    expect(tree.root.findAllByType('confirm' as any)).toHaveLength(1);
    const transition = tree.root.findByType('prompt-transition' as any);
    expect(transition.props.anchor).toBe('foot');
    // The spotlight glass is the veil; the flat scrim would double it.
    expect(transition.props.scrimColor).toBe('transparent');
    expect(tree.root.findByType('spotlight' as any).props.visible).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it('pans the map for the card where the runtime frames seats, and never also insets it', async () => {
    const current = scope({
      pendingSeat: { id: 's-9', label: 'B 3', screenPoint: { x: 100, y: 220 } },
      snapshot: liveSnapshot,
    });
    state.scope = current;
    const { tree } = await render(current);
    expect(tree.root.findByType('spotlight' as any).props.screenPoint).toMatchObject({ x: 100, y: 220 });
    const card = tree.root.findByType('confirm' as any);
    await act(async () => { card.props.onBandChange(260); });
    // The lift only sends once two consecutive syncs agree on the map height:
    // the web view resizes a frame or two after the layout, and the runtime
    // pans against ITS height at the moment the command lands (§3.8.2).
    await act(async () => {
      tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(current.controller.frameSeat).toHaveBeenCalled();
    // §3.8.2: a runtime that pans is never also given the card's band.
    const lastBand = current.lease.set.mock.calls.at(-1)?.[0];
    expect(lastBand?.bottom ?? 0).toBeLessThan(260);
    await act(async () => { tree.unmount(); });
  });

  it('reports the card band as an inset where the runtime cannot frame a seat', async () => {
    const current = scope(
      { pendingSeat: { id: 's-9', label: 'B 3' }, snapshot: liveSnapshot },
      { supportsFrameSeat: false, frameSeat: vi.fn() },
    );
    state.scope = current;
    const { tree } = await render(current);
    const card = tree.root.findByType('confirm' as any);
    await act(async () => { card.props.onBandChange(260); });
    expect(current.controller.frameSeat).not.toHaveBeenCalled();
    expect(current.lease.set.mock.calls.at(-1)?.[0].bottom).toBeGreaterThanOrEqual(260);
    await act(async () => { tree.unmount(); });
  });

  it('tells a lapsed hold once, through the toast the state machine builds', async () => {
    state.showToast.mockClear();
    const current = scope({
      snapshot: liveSnapshot,
      holdLapsed: true,
      holdLapse: {
        key: 'lapse-1', lapsedLabels: ['A 1'], recoverableLabels: ['A 1'], takenLabels: [],
      },
    });
    state.scope = current;
    const { tree } = await render(current);
    expect(state.showToast).toHaveBeenCalledTimes(1);
    const request = state.showToast.mock.calls[0]![0] as { message: string; onAction?: () => void };
    expect(typeof request.message).toBe('string');
    // `reselectLapsedSeats` is the one recovery a toast may carry.
    request.onAction?.();
    expect(current.reselectHoldLapse).toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('mounts the buyer-state surfaces the layout owns', async () => {
    const current = scope({ snapshot: liveSnapshot });
    state.accessibility = true;
    state.scope = current;
    const { tree } = await render(current);
    expect(tree.root.findAllByType('sold-out' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('booked' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('access-panel' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('access-stepper' as any)).toHaveLength(1);
    // The hand-off notice rides the tray's inline action slot (§3.13.13).
    const sheet = tree.root.findByType('cart-sheet' as any);
    let inline!: TestRenderer.ReactTestRenderer;
    await act(async () => { inline = TestRenderer.create(sheet.props.actionError as never); });
    expect(inline.root.findAllByType('hold-ownership' as any)).toHaveLength(1);
    expect(sheet.props.salesClosed).toBeTruthy();
    await act(async () => { inline.unmount(); });
    expect(tree.root.findAllByType('toast-layer' as any)).toHaveLength(1);
    state.accessibility = false;
    await act(async () => { tree.unmount(); });
  });
});
