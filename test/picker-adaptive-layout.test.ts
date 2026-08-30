import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ width: 320, scope: undefined as any, chartMounts: 0, accessibility: false }));

vi.mock('react-native', () => ({
  View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {} }, useWindowDimensions: () => ({ width: state.width }),
  StatusBar: 'StatusBar',
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove: () => undefined }) },
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

import { SeatLayerPickerAdaptiveLayout } from '../src/picker/SeatLayerPickerAdaptiveLayout';
import {
  planSeatLayerPickerAdaptiveLayout,
  planSeatLayerPickerPhoneBands,
  seatLayerPickerAdaptiveInteractionBlocked,
  seatLayerPickerPendingCandidateEpochFor,
} from '../src/picker/adaptiveLayoutState';
import { seatLayerPickerAdaptiveUnlockDelay } from '../src/picker/adaptiveInteraction';
import { resolveSeatLayerPickerAdaptiveSafeLayout } from '../src/picker/adaptiveSafeLayout';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function scope(overrides: Record<string, unknown> = {}): any {
  const calls: unknown[] = [];
  const lease = { set: vi.fn(), remove: vi.fn() };
  return {
    controller: {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => undefined,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    },
    sessionId: 1, snapshot: undefined, pendingSeat: null, isReady: true, error: undefined, readOnly: false,
    presentation: { prompt: null, sheet: 'collapsed' }, setPresentation: (event: unknown) => calls.push(event),
    claimViewportInsetBand: () => lease, reportError: vi.fn(), resolvedTheme: { colors: { background: '#f6f7fb', surface: '#fff' } }, styles: {}, strings: { translate: (key: string) => key },
    confirmPending: vi.fn(), calls, lease, ...overrides,
  };
}

const checkout = () => undefined;

function measure(tree: TestRenderer.ReactTestRenderer, width: number, height = 600): void {
  const root = tree.root.find((node) => typeof node.props.testID === 'string' &&
    node.props.testID.startsWith('seatlayer-adaptive-'));
  root.props.onLayout({ nativeEvent: { layout: { width, height } } });
}

describe('adaptive picker composition', () => {
  it('relinquishes every presentation-global adapter during controlled modal cleanup', async () => {
    state.width = 320;
    state.scope = scope();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
        onCheckout: checkout,
        options: { haptics: true },
        hapticAdapter: { play: () => undefined },
      }));
    });
    expect(tree.root.findAllByType('system-bars' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('haptics' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('back-handler' as any)).toHaveLength(1);
    await act(async () => {
      tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, {
        onCheckout: checkout,
        options: { haptics: true },
        hapticAdapter: { play: () => undefined },
        presentationActive: false,
      }));
    });
    expect(tree.root.findAllByType('system-bars' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('haptics' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('back-handler' as any)).toHaveLength(0);
    await act(async () => { tree.unmount(); });
  });

  it('resolves generated phone/wide breakpoints and status interaction precedence', () => {
    expect(planSeatLayerPickerAdaptiveLayout(320, {}).layout).toBe('phone');
    expect(planSeatLayerPickerAdaptiveLayout(840, {}).layout).toBe('wide');
    expect(seatLayerPickerAdaptiveInteractionBlocked(true, undefined, false)).toBe(false);
    expect(seatLayerPickerAdaptiveInteractionBlocked(false, undefined, false)).toBe(true);
    expect(seatLayerPickerAdaptiveInteractionBlocked(true, new Error('fatal'), false)).toBe(true);
    expect(seatLayerPickerAdaptiveInteractionBlocked(true, undefined, true)).toBe(true);
    expect(planSeatLayerPickerPhoneBands({ topHeight: 108, dockHeight: 52, controlBottomHeight: 54, floorSelectorBottomHeight: 54, accessibilityBottomHeight: 54, venueBottomHeight: 88 }))
      .toEqual({ top: 108, bottom: 168 });
    expect(planSeatLayerPickerPhoneBands({ topHeight: 0, dockHeight: 0, controlBottomHeight: 0, floorSelectorBottomHeight: 0, accessibilityBottomHeight: 0, venueBottomHeight: 0 }))
      .toEqual({ top: 0, bottom: 0 });
    expect(seatLayerPickerAdaptiveUnlockDelay(false)).toBe(180);
    expect(seatLayerPickerAdaptiveUnlockDelay(true)).toBe(0);
    const controller = {};
    expect(seatLayerPickerPendingCandidateEpochFor({ id: 'A', controller, scopeSessionId: 1, runtimeSessionId: 'one' }))
      .not.toBe(seatLayerPickerPendingCandidateEpochFor({ id: 'A', controller, scopeSessionId: 2, runtimeSessionId: 'two' }));
  });

  it('blocks a proven-empty map and removes impossible ticket actions while retaining attribution', async () => {
    state.width = 320;
    const current = scope({
      snapshot: {
        categories: [{ available: 0, notForSale: false }],
        generalAdmissionAreas: [], selection: [], cartLines: [], capabilities: [],
        event: { mode: 'live' }, map: { floors: [], buyerView: 'map' },
      },
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout }));
    });
    expect(tree.root.findAllByType('empty' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('cart-sheet' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('checkout' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('attribution' as any)).toHaveLength(1);
    expect(current.controller.setInteractionEnabled).toHaveBeenCalledWith(false);
    await act(async () => { tree.unmount(); });
  });

  it('keeps one chart instance across a theme rebuild, uses the phone band, and collapses a pending sheet', async () => {
    state.width = 320;
    state.chartMounts = 0;
    state.scope = scope({
      pendingSeat: { id: 'seat' }, presentation: { prompt: null, sheet: 'expanded', mapRung: 'seats' },
      snapshot: { categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map', rung: 'seats', focusedSectionId: 's1' }, sections: [{ id: 's1', label: 'One' }] },
    });
    const onSectionFocused = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, onSectionFocused })); });
    expect(tree.root.findByProps({ testID: 'seatlayer-adaptive-phone' })).toBeTruthy();
    const sheet = tree.root.findByType('cart-sheet' as any);
    expect(sheet.props.expanded).toBe(true);
    expect(sheet.props.onCheckout).toBe(checkout);
    expect(sheet.props.holdLapse).toBeTruthy();
    expect(sheet.props.checkoutBar.props.compact).toBe(false);
    expect(tree.root.findByType('dock' as any).props.onSectionChanged).toBe(onSectionFocused);
    await act(async () => { sheet.props.onExpandedChanged(false); });
    expect(state.scope.lease.set).toHaveBeenLastCalledWith({ top: 0, bottom: 106 });
    expect(state.scope.calls).toContainEqual({ type: 'setSheet', sheet: 'collapsed' });
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { layout: 'phone' } })); });
    expect(state.chartMounts).toBe(1);
    state.scope.resolvedTheme = { ...state.scope.resolvedTheme, themeMode: 'dark' };
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    await act(async () => { measure(tree, 920); });
    expect(tree.root.findByProps({ testID: 'seatlayer-adaptive-wide' })).toBeTruthy();
    expect(state.chartMounts).toBe(1);
    await act(async () => { tree.unmount(); });
  });

  it('renders the fixed wide rail without a phone inset and retains mandatory attribution through builder failures', async () => {
    state.width = 920;
    state.scope = scope({ snapshot: { categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' } } });
    const onSeatRemoved = vi.fn();
    const onSectionFocused = vi.fn();
    const builders = { header: () => { throw new Error('host builder'); }, map: () => React.createElement('replacement-map'), attribution: () => null } as any;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      builders, onCheckout: checkout, onSeatRemoved, onSectionFocused,
    })); });
    await act(async () => { measure(tree, 920); });
    const rail = tree.root.findByProps({ testID: 'seatlayer-wide-rail' });
    expect(rail.props.style[0]).toMatchObject({ borderStartWidth: expect.any(Number) });
    expect(rail.props.style[0].padding).toBeUndefined();
    expect(tree.root.findAllByType('replacement-map' as any)).toHaveLength(1);
    expect(tree.root.findByType('controls' as any).props.reserveInset).toBe(false);
    expect(tree.root.findAllByType('header' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('attribution' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('cart-sheet' as any)).toHaveLength(0);
    const cartList = tree.root.findByType('cart-list' as any);
    cartList.props.onSeatRemoved({ label: 'Seat A' });
    expect(onSeatRemoved).toHaveBeenCalledWith('Seat A');
    expect(tree.root.findByType('section-navigator' as any).props.onSectionFocused).toBe(onSectionFocused);
    const checkoutBar = tree.root.findByType('checkout' as any);
    expect(checkoutBar.props.onCheckout).toBe(checkout);
    expect(checkoutBar.props.compact).toBe(false);
    expect(state.scope.lease.remove).toHaveBeenCalledTimes(1);
    expect(state.scope.reportError.mock.calls.length).toBeGreaterThanOrEqual(2);
    await act(async () => { tree.unmount(); });
  });

  it('gives wide accessibility chrome one side-rail owner', async () => {
    state.width = 920;
    state.accessibility = true;
    state.scope = scope({
      snapshot: { categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' } },
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
        onCheckout: checkout,
        options: { layout: 'wide' },
      }));
    });
    expect(tree.root.findAllByType('accessibility' as any)).toHaveLength(1);
    expect(tree.root.findByType('accessibility' as any).parent?.props.style).toMatchObject({
      gap: 8,
      paddingHorizontal: 16,
    });
    await act(async () => { tree.unmount(); });
    state.accessibility = false;
  });

  it('routes only a typed GA click or a typed variable-table selection to its matching prompt', async () => {
    state.width = 320;
    const tableSnapshot = {
      sessionId: 'runtime', revision: 3, hold: { active: false }, selection: [{ id: 'table-1', label: 'Table 1', objectType: 'table', bookingMode: 'variable' }],
      capabilities: [], map: { floors: [] }, categories: [], event: { mode: 'live' },
    };
    const tableScope = scope({
      pendingSeat: { id: 'table-1' }, snapshot: tableSnapshot,
      controller: {
        mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
        setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => undefined,
        subscribeGACandidate: () => () => undefined, getSnapshot: () => tableSnapshot,
      },
    });
    state.scope = tableScope;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(tree.root.findAllByType('table-prompt' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('ga-prompt' as any)).toHaveLength(0);
    const tableEpoch = tree.root.findByType('table-prompt' as any).props.candidate.epoch;
    tableSnapshot.revision = 4;
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(tree.root.findByType('table-prompt' as any).props.candidate.epoch).toBe(tableEpoch);
    const gaCandidate = Object.freeze({ areaId: 'ga', clickEpoch: 2 });
    state.scope = scope({ pendingSeat: { id: 'table-1' }, snapshot: tableSnapshot, controller: { ...tableScope.controller, getGACandidate: () => gaCandidate } });
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(tree.root.findAllByType('ga-prompt' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('table-prompt' as any)).toHaveLength(0);
    expect(state.scope.controller.setInteractionEnabled).toHaveBeenCalledWith(false);
    await act(async () => { tree.unmount(); });
  });

  it('reserves only visible phone rails and cancels an old delayed map unlock after replacement', async () => {
    vi.useFakeTimers();
    state.width = 320;
    const first = scope({ isReady: false, snapshot: { categories: [{}], capabilities: ['venue3d'], map: { floors: [{}, {}], buyerView: 'venue3d' }, event: { mode: 'test' } } });
    state.scope = first;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(first.lease.set).toHaveBeenLastCalledWith({ top: 118, bottom: 0 });
    expect(tree.root.findByType('venue' as any).props).toMatchObject({ topInset: 46, bottomInset: 10, reserveInset: true });
    expect(tree.root.findByType('test-badge' as any).parent?.props.style[1].top).toBe(98);
    expect(first.controller.setInteractionEnabled).toHaveBeenCalledWith(false);
    state.scope = scope({ sessionId: 2 });
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    await act(async () => { vi.runAllTimers(); });
    expect(first.controller.setInteractionEnabled).toHaveBeenCalledWith(true);
    await act(async () => { tree.unmount(); });
    vi.useRealTimers();
  });

  it('opens a GA prompt from the candidate store without a parent rerender', async () => {
    let listener: (() => void) | undefined;
    let candidate: Readonly<{ areaId: string; clickEpoch: number }> | undefined;
    const controller = {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => candidate,
      subscribeGACandidate: (next: () => void) => { listener = next; return () => { listener = undefined; }; },
      getSnapshot: () => undefined,
    };
    state.width = 320;
    state.scope = scope({ controller });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(tree.root.findAllByType('ga-prompt' as any)).toHaveLength(0);
    candidate = Object.freeze({ areaId: 'standing', clickEpoch: 8 });
    await act(async () => { listener?.(); });
    expect(tree.root.findAllByType('ga-prompt' as any)).toHaveLength(1);
    expect(controller.setInteractionEnabled).toHaveBeenCalledWith(false);
    await act(async () => { tree.unmount(); });
  });

  it('keeps a lease through ordinary band updates and only collapses on a real seats-to-overview descent', async () => {
    state.width = 320;
    const current = scope({
      presentation: { prompt: null, sheet: 'expanded', mapRung: 'seats' },
      snapshot: { categories: [{}], capabilities: [], map: { floors: [], buyerView: 'map' }, event: { mode: 'live' } },
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(current.calls).not.toContainEqual({ type: 'setSheet', sheet: 'collapsed' });
    current.snapshot.categories = [{}, {}];
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(current.lease.remove).not.toHaveBeenCalled();
    current.presentation = { prompt: null, sheet: 'expanded', mapRung: 'overview' };
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(current.calls).toContainEqual({ type: 'setSheet', sheet: 'collapsed' });
    await act(async () => { tree.unmount(); });
    expect(current.lease.remove).toHaveBeenCalledTimes(1);
  });

  it('does not fall through a null GA builder and wires option-gated chrome through scoped parts', async () => {
    const gaCandidate = Object.freeze({ areaId: 'standing', clickEpoch: 9 });
    const adapter = { play: vi.fn() };
    state.width = 320;
    state.scope = scope({ controller: {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => gaCandidate,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    } });
    const builders = { generalAdmissionPrompt: () => null };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      builders, hapticAdapter: adapter, onCheckout: checkout,
      options: { enableBestAvailable: false, chrome: { cartSheet: false, confirmCard: false, holdPill: false } },
    })); });
    expect(tree.root.findAllByType('ga-prompt' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('table-prompt' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('confirm' as any)).toHaveLength(0);
    expect(tree.root.findByType('header' as any).props.showHoldPill).toBe(false);
    expect(tree.root.findAllByType('cart-sheet' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('best-seats' as any)).toHaveLength(0);
    expect(tree.root.findByType('haptics' as any).props.adapter).toBe(adapter);
    expect(state.scope.controller.setInteractionEnabled).not.toHaveBeenCalledWith(false);
    expect(state.scope.confirmPending).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('leaves an initially interactive map untouched until a buyer-owned surface appears', async () => {
    state.width = 320;
    state.scope = scope();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(state.scope.controller.setInteractionEnabled).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('forwards chart readiness and only observes committed confirmation or immersive actions', async () => {
    const onReady = vi.fn();
    const onSeatSelected = vi.fn();
    const onSeatViewOpened = vi.fn();
    const seat = Object.freeze({ id: 'A-1', label: 'A 1' });
    state.width = 320;
    state.scope = scope({
      pendingSeat: seat,
      snapshot: {
        sessionId: 'runtime', revision: 1, capabilities: [], categories: [], event: { mode: 'live' },
        map: { floors: [], buyerView: 'map' }, selection: [{ ...seat, objectType: 'seat' }],
      },
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, onReady, onSeatSelected, onSeatViewOpened,
    })); });
    const chart = tree.root.findByType('chart' as any);
    expect(chart.props.onReady).toBe(onReady);
    const confirm = tree.root.findByType('confirm' as any);
    await act(async () => { confirm.props.onAction({ action: 'confirm', seat }); });
    await act(async () => { confirm.props.onAction({ action: 'seatView', seat }); });
    await act(async () => { confirm.props.onAction({ action: 'venue3d', seat }); });
    await act(async () => { confirm.props.onAction({ action: 'cancel', seat }); });
    expect(onSeatSelected).toHaveBeenCalledWith(seat);
    expect(onSeatViewOpened).toHaveBeenNthCalledWith(1, seat);
    expect(onSeatViewOpened).toHaveBeenNthCalledWith(2, seat);
    expect(onSeatSelected).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it('retires a null compact builder without blocking the map or collapsing its cart', async () => {
    const current = scope({
      pendingSeat: { id: 'A-1' }, presentation: { prompt: null, sheet: 'expanded' },
      snapshot: { sessionId: 'runtime', revision: 1, capabilities: [], categories: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' }, selection: [{ id: 'A-1', objectType: 'seat' }] },
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      builders: { confirmCard: () => null }, onCheckout: checkout, options: { panelInitiallyCollapsed: false },
    })); });
    expect(current.confirmPending).toHaveBeenCalledTimes(1);
    expect(current.controller.setInteractionEnabled).not.toHaveBeenCalledWith(false);
    expect(current.calls).not.toContainEqual({ type: 'setSheet', sheet: 'collapsed' });
    expect(tree.root.findByType('prompt-transition' as any).props.prompt).toBeNull();
    await act(async () => { tree.unmount(); });
  });

  it('retires a null variable-table builder without exposing an invisible prompt', async () => {
    const snapshot = { sessionId: 'runtime', revision: 1, hold: { active: false }, capabilities: [], categories: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' }, selection: [{ id: 'table-1', label: 'Table 1', objectType: 'table', bookingMode: 'variable' }] };
    const controller = {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true, supportsPickerEvent: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => undefined,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => snapshot,
    };
    const current = scope({
      pendingSeat: { id: 'table-1' },
      controller, snapshot,
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      builders: { tablePrompt: () => false }, onCheckout: checkout,
    })); });
    expect(current.confirmPending).toHaveBeenCalledTimes(1);
    expect(current.controller.setInteractionEnabled).not.toHaveBeenCalledWith(false);
    await act(async () => { tree.unmount(); });
  });

  it('uses the rendered phone rails and stacks floor selection above accessibility controls', async () => {
    state.accessibility = true;
    const current = scope({
      snapshot: { categories: [{ notForSale: false }], capabilities: [], event: { mode: 'test' }, map: { floors: [{ id: 'one' }, { id: 'two' }], buyerView: 'map', rung: 'seats', focusedSectionId: 's1' }, sections: [{ id: 's1', label: 'One' }] },
      presentation: { prompt: null, sheet: 'collapsed', mapRung: 'seats' },
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    const floor = tree.root.findByType('floor-selector' as any);
    const access = tree.root.findByType('accessibility' as any);
    const floorStyle = floor.parent?.props.style[1] as { bottom: number };
    const accessStyle = access.parent?.props.style[1] as { bottom: number };
    expect(floorStyle.bottom).toBeGreaterThan(accessStyle.bottom);
    expect(current.lease.set).toHaveBeenLastCalledWith({ top: 82, bottom: 168 });
    state.accessibility = false;
    await act(async () => { tree.unmount(); });
  });

  it('retries a buyer lock when native-chrome readiness arrives after the prompt', async () => {
    let ready = false;
    const candidate = Object.freeze({ areaId: 'ga', clickEpoch: 1 });
    const controller = {
      mapController: { isReady: false, supportsPickerCapability: () => ready, supportsPickerCommand: () => ready },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => candidate,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    };
    state.scope = scope({ controller });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(controller.setInteractionEnabled).not.toHaveBeenCalled();
    ready = true; controller.mapController.isReady = true;
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(controller.setInteractionEnabled).toHaveBeenCalledWith(false);
    await act(async () => { tree.unmount(); });
  });

  it('uses the dedicated wide confirmation with its inspection options and a stable transition key', async () => {
    const current = scope({
      pendingSeat: { id: 'A-1' },
      snapshot: { sessionId: 'runtime', revision: 1, capabilities: [], categories: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' }, selection: [{ id: 'A-1', objectType: 'seat' }] },
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { enableSeatView: true, enable3D: true },
    })); });
    await act(async () => { measure(tree, 920); });
    const confirmation = tree.root.findByType('wide-confirm' as any);
    expect(confirmation.props.showSeatView).toBe(true);
    expect(confirmation.props.show3D).toBe(true);
    expect(tree.root.findByType('prompt-transition' as any).props.prompt).toBeTruthy();
    await act(async () => { tree.unmount(); });
  });

  it('passes explicit null slots to the cart and restores the required footer when its builder returns false', async () => {
    state.scope = scope();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout,
      builders: { actionError: () => false, bestAvailable: () => undefined, cartList: () => false, checkoutBar: () => false, holdLapse: () => undefined },
    })); });
    const sheet = tree.root.findByType('cart-sheet' as any);
    expect(sheet.props.actionError).toBeNull();
    expect(sheet.props.bestSeats).toBeNull();
    expect(sheet.props.cartList).toBeNull();
    expect(sheet.props.checkoutBar).toBeNull();
    expect(sheet.props.holdLapse).toBeNull();
    await act(async () => { tree.unmount(); });
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, builders: { cartSheet: () => false },
    })); });
    expect(tree.root.findAllByType('cart-sheet' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('attribution' as any)).toHaveLength(1);
    await act(async () => { tree.unmount(); });
  });

  it('does not invoke unavailable chrome builders merely because a replacement slot exists', async () => {
    const inaccessible = vi.fn();
    const unavailable = vi.fn();
    const seatView = Object.freeze({ title: 'A seat' });
    state.accessibility = true;
    state.scope = scope({
      controller: {
        mapController: {
          isReady: true,
          supportsPickerCapability: (name: string) => name === 'native-chrome-contract-v1',
          supportsPickerCommand: () => false,
          supportsPickerEvent: () => false,
        },
        setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => undefined,
        subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
        getSeatView: () => seatView, subscribeSeatView: () => () => undefined,
      },
      snapshot: { categories: [], capabilities: ['seatView'], event: { mode: 'live' }, map: { floors: [{}, {}], buyerView: 'map' } },
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, builders: {
        accessibilityFilters: inaccessible, floorSelector: unavailable, floorStrip: unavailable,
        mapControls: unavailable, seatViewChrome: unavailable,
      },
    })); });
    expect(unavailable).not.toHaveBeenCalled();
    expect(inaccessible).toHaveBeenCalledTimes(1);
    state.accessibility = false;
    await act(async () => { tree.unmount(); });
  });

  it('keeps passive panorama copy clear of irrelevant phone controls without bypassing the map-control builder', async () => {
    const controlsBuilder = vi.fn(({ defaultChild }: { defaultChild: React.ReactNode }) => defaultChild);
    const seatView = Object.freeze({
      title: 'Guest Tables · T22 · Seat 1',
      caption: 'View towards the stage',
      real: true,
      generated: false,
    });
    const snapshot = {
      sessionId: 'panorama',
      categories: [{ key: 'guest', label: 'Guest', priceMin: 95 }],
      capabilities: ['seatView', 'venue3d'],
      event: { mode: 'live' },
      sections: [{ id: 'guest', label: 'Guest Tables' }],
      map: {
        buyerView: 'map',
        rung: 'seats',
        focusedSection: { id: 'guest', label: 'Guest Tables' },
        floors: [{ id: 'ground' }, { id: 'balcony' }],
      },
    };
    state.accessibility = true;
    state.scope = scope({
      controller: {
        mapController: {
          isReady: true,
          supportsPickerCapability: () => true,
          supportsPickerCommand: () => true,
          supportsPickerEvent: (name: string) => name === 'seatView.changed',
        },
        setInteractionEnabled: vi.fn(() => Promise.resolve()),
        getGACandidate: () => undefined,
        subscribeGACandidate: () => () => undefined,
        getSnapshot: () => snapshot,
        getSeatView: () => seatView,
        subscribeSeatView: () => () => undefined,
      },
      snapshot,
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout,
      builders: { mapControls: controlsBuilder },
    })); });
    await act(async () => { tree.root.findByType('controls' as any).props.onViewModeLayout(128); });
    expect(tree.root.findAllByType('panorama' as any)).toHaveLength(1);
    expect(controlsBuilder).toHaveBeenCalled();
    expect(tree.root.findByType('legend' as any).props.edgeFadeColor).toBe('#0F1522');
    expect(tree.root.findByType('controls' as any).props).toMatchObject({
      includeViewModeControl: true,
      showOverviewControl: false,
      showZoomControls: false,
      showZoomToFitControl: false,
    });
    expect(tree.root.findAllByType('accessibility' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('floors' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('floor-selector' as any)).toHaveLength(0);
    await act(async () => { tree.unmount(); });
    state.accessibility = false;
  });

  it('keys panel initialization and interaction flights to the exact runtime opening', async () => {
    vi.useFakeTimers();
    const candidate = Object.freeze({ areaId: 'ga', clickEpoch: 1 });
    let activeCandidate: typeof candidate | undefined = candidate;
    let notifyCandidate: (() => void) | undefined;
    const controller = {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => activeCandidate,
      subscribeGACandidate: (listener: () => void) => { notifyCandidate = listener; return () => { notifyCandidate = undefined; }; }, getSnapshot: () => undefined,
    };
    const current = scope({ controller, presentation: { prompt: null, sheet: 'collapsed' }, snapshot: { sessionId: 'one', categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' } } });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(current.calls).toContainEqual({ type: 'setSheet', sheet: 'expanded' });
    expect(controller.setInteractionEnabled).toHaveBeenCalledWith(false);
    const callsAfterOpen = current.calls.length;
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(current.calls).toHaveLength(callsAfterOpen);
    current.snapshot = { ...current.snapshot, sessionId: 'two' };
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    expect(controller.setInteractionEnabled).toHaveBeenLastCalledWith(false);
    expect((controller.setInteractionEnabled as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => call[0])).toEqual([false, false]);
    activeCandidate = undefined;
    await act(async () => { notifyCandidate?.(); });
    current.snapshot = { ...current.snapshot, sessionId: 'three' };
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, options: { panelInitiallyCollapsed: false } })); });
    await act(async () => { vi.runAllTimers(); });
    expect(controller.setInteractionEnabled).not.toHaveBeenCalledWith(true);
    await act(async () => { tree.unmount(); });
    vi.useRealTimers();
  });

  it('initializes a cart enabled mid-opening once and retires an invisible expanded sheet rung', async () => {
    const current = scope({ presentation: { prompt: null, sheet: 'collapsed' } });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { panelInitiallyCollapsed: false, chrome: { cartSheet: false } },
    })); });
    expect(current.calls).toHaveLength(0);
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { panelInitiallyCollapsed: false, chrome: { cartSheet: true } },
    })); });
    expect(current.calls).toContainEqual({ type: 'setSheet', sheet: 'expanded' });
    current.presentation = { prompt: null, sheet: 'expanded' };
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { panelInitiallyCollapsed: false, chrome: { cartSheet: false } },
    })); });
    expect(current.calls).toContainEqual({ type: 'setSheet', sheet: 'collapsed' });
    const calls = current.calls.length;
    current.presentation = { prompt: null, sheet: 'collapsed' };
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { panelInitiallyCollapsed: false, chrome: { cartSheet: true } },
    })); });
    expect(current.calls).toHaveLength(calls);
    await act(async () => { tree.unmount(); });
  });

  it('does not replay an initial expansion after disabled chrome retired an existing sheet', async () => {
    const current = scope({ presentation: { prompt: null, sheet: 'expanded' } });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { panelInitiallyCollapsed: false, chrome: { cartSheet: false } },
    })); });
    expect(current.calls).toEqual([{ type: 'setSheet', sheet: 'collapsed' }]);
    current.presentation = { prompt: null, sheet: 'collapsed' };
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { panelInitiallyCollapsed: false, chrome: { cartSheet: true } },
    })); });
    expect(current.calls).toHaveLength(1);
    await act(async () => { tree.unmount(); });
  });

  it('restores interaction when an active runtime unmounts without replacement', async () => {
    const candidate = Object.freeze({ areaId: 'ga', clickEpoch: 3 });
    const controller = {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => candidate,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    };
    state.scope = scope({ controller, snapshot: { sessionId: 'runtime', categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' } } });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(controller.setInteractionEnabled).toHaveBeenLastCalledWith(false);
    await act(async () => { tree.unmount(); });
    expect(controller.setInteractionEnabled).toHaveBeenLastCalledWith(true);
  });

  it('transfers a blocked interaction lease across a scope-session replacement without an unlock flash', async () => {
    const candidate = Object.freeze({ areaId: 'ga', clickEpoch: 7 });
    const controller = {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => candidate,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    };
    const first = scope({ controller, sessionId: 1, snapshot: { sessionId: 'runtime', categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' } } });
    state.scope = first;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(controller.setInteractionEnabled).toHaveBeenLastCalledWith(false);
    state.scope = scope({ controller, sessionId: 2, snapshot: first.snapshot });
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(controller.setInteractionEnabled).toHaveBeenCalledTimes(1);
    expect(controller.setInteractionEnabled).not.toHaveBeenCalledWith(true);
    await act(async () => { tree.unmount(); });
  });

  it('does not reserve or invoke a floor strip without its exact set-floor command', async () => {
    const floorBuilder = vi.fn();
    state.scope = scope({
      controller: {
        mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: (name: string) => name !== 'picker.setFloor' },
        setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => undefined,
        subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
      },
      snapshot: { categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [{}, {}], buyerView: 'map' } },
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, builders: { floorStrip: floorBuilder } })); });
    expect(floorBuilder).not.toHaveBeenCalled();
    expect(state.scope.lease.set).toHaveBeenLastCalledWith({ top: 0, bottom: 54 });
    await act(async () => { tree.unmount(); });
  });

  it('uses one floor navigator by default and preserves an explicit phone strip choice', async () => {
    state.width = 320;
    state.scope = scope({
      snapshot: { categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [{ id: 'ground' }, { id: 'upper' }], buyerView: 'map' } },
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(tree.root.findAllByType('floor-selector' as any)).toHaveLength(1);
    expect(tree.root.findAllByType('floors' as any)).toHaveLength(0);
    await act(async () => { measure(tree, 900); });
    expect(tree.root.findAllByType('floor-selector' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('floors' as any)).toHaveLength(1);
    await act(async () => { tree.unmount(); });

    state.width = 320;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { chrome: { floorSelector: false, floorStrip: true } },
    })); });
    expect(tree.root.findAllByType('floor-selector' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('floors' as any)).toHaveLength(1);
    await act(async () => { tree.unmount(); });
  });

  it('uses normalized parent-safe geometry for the breakpoint and all modal surfaces', async () => {
    const candidate = Object.freeze({ areaId: 'standing', clickEpoch: 1 });
    const controller = {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => candidate,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    };
    state.accessibility = true;
    state.scope = scope({
      controller,
      snapshot: { categories: [{ notForSale: false }], capabilities: [], event: { mode: 'live' }, map: { floors: [{ id: 'a' }, { id: 'b' }], buyerView: 'map' } },
    });
    const input = { top: 12, right: 30, bottom: 18, left: 40 };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, safeAreaInsets: input, options: { chrome: { mapControls: false } },
    })); });
    await act(async () => { measure(tree, 900, 400); });
    const expected = resolveSeatLayerPickerAdaptiveSafeLayout({ width: 900, height: 400 }, input).insets;
    expect(tree.root.findByProps({ testID: 'seatlayer-adaptive-phone' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'seatlayer-adaptive-safe-content' }).props.style[1]).toMatchObject({
      paddingBottom: 18, paddingEnd: 30, paddingStart: 40, paddingTop: 12,
    });
    const forwarded = tree.root.findByType('ga-prompt' as any).props.safeAreaInsets;
    expect(forwarded).toEqual(expected);
    const cart = tree.root.findByType('cart-sheet' as any);
    expect(cart.props.safeAreaInsets).toBe(forwarded);
    expect(cart.props.bestSeats.props.safeAreaInsets).toBe(forwarded);
    expect(tree.root.findByType('accessibility' as any).props.safeAreaInsets).toBe(forwarded);
    expect(tree.root.findByType('floor-selector' as any).props.safeAreaInsets).toBe(forwarded);
    state.accessibility = false;
    await act(async () => { tree.unmount(); });
  });

  it('blocks the physical chart owner only for an actual native owner', async () => {
    const candidate = Object.freeze({ areaId: 'standing', clickEpoch: 1 });
    let activeCandidate: typeof candidate | undefined;
    const controller = {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => activeCandidate,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    };
    const current = scope({ controller, isReady: false });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    const owner = () => tree.root.findByProps({ testID: 'seatlayer-chart-owner' });
    expect(owner().props.pointerEvents).toBe('none');
    current.error = new Error('fatal');
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(owner().props.pointerEvents).toBe('none');
    current.isReady = true; current.error = undefined; current.presentation = { prompt: { kind: 'accessibility' }, sheet: 'collapsed' };
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    expect(owner().props.pointerEvents).toBe('none');
    current.presentation = { prompt: null, sheet: 'collapsed' };
    activeCandidate = candidate;
    await act(async () => { tree.update(React.createElement(SeatLayerPickerAdaptiveLayout, { builders: { generalAdmissionPrompt: () => null }, onCheckout: checkout })); });
    expect(owner().props.pointerEvents).toBe('auto');
    await act(async () => { tree.unmount(); });
  });

  it('withholds a localized price rail until its same-row view control is measured', async () => {
    state.scope = scope({
      snapshot: { categories: [{ notForSale: false }], capabilities: ['venue3d'], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' } },
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout })); });
    const controls = tree.root.findByType('controls' as any);
    expect(tree.root.findAllByType('legend' as any)).toHaveLength(0);
    await act(async () => { controls.props.onViewModeLayout(280); });
    const legend = tree.root.findByType('legend' as any);
    expect(legend.parent?.props.style[1]).toMatchObject({ right: 298, top: 8 });
    expect(controls).toBeTruthy();
    await act(async () => { tree.unmount(); });
  });

  it('reserves a same-row top-left overview target before the price rail', async () => {
    const current = scope({
      snapshot: {
        categories: [{ notForSale: false }], capabilities: [], event: { mode: 'test' },
        map: { floors: [{ id: 'one' }, { id: 'two' }], buyerView: 'map', focusedSectionId: 's1' },
        sections: [{ id: 's1', label: 'One' }],
      },
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { chrome: { overview: true } },
    })); });
    expect(tree.root.findByType('legend' as any).parent?.props.style[1]).toMatchObject({ left: 62, right: 44, top: 8 });
    expect(tree.root.findAllByType('floors' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('floor-selector' as any)).toHaveLength(1);
    expect(tree.root.findByType('test-badge' as any).parent?.props.style[1].top).toBe(62);
    expect(current.lease.set).toHaveBeenLastCalledWith({ top: 82, bottom: 116 });
    await act(async () => { tree.unmount(); });
  });

  it('reserves measured right and fixed left controls in one localized top rail', async () => {
    const current = scope({
      snapshot: {
        categories: [{ notForSale: false }], capabilities: ['venue3d'], event: { mode: 'test' },
        map: { floors: [{ id: 'one' }, { id: 'two' }], buyerView: 'map', focusedSectionId: 's1' },
        sections: [{ id: 's1', label: 'One' }],
      },
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { chrome: { overview: true } },
    })); });
    const controls = tree.root.findByType('controls' as any);
    expect(tree.root.findAllByType('legend' as any)).toHaveLength(0);
    await act(async () => { controls.props.onViewModeLayout(280); });
    expect(tree.root.findByType('legend' as any).parent?.props.style[1]).toMatchObject({ left: 62, right: 298, top: 8 });
    expect(tree.root.findAllByType('floors' as any)).toHaveLength(0);
    expect(tree.root.findAllByType('floor-selector' as any)).toHaveLength(1);
    expect(tree.root.findByType('test-badge' as any).parent?.props.style[1].top).toBe(62);
    expect(current.lease.set).toHaveBeenLastCalledWith({ top: 82, bottom: 116 });
    await act(async () => { tree.unmount(); });
  });

  it('does not claim or invoke venue chrome without its exact capability and command', async () => {
    const venue = vi.fn();
    state.scope = scope({
      controller: {
        mapController: {
          isReady: true,
          supportsPickerCapability: (name: string) => name === 'native-chrome-contract-v1',
          supportsPickerCommand: () => false,
        },
        setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => undefined,
        subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
      },
      snapshot: { categories: [], capabilities: ['venue3d'], event: { mode: 'live' }, map: { floors: [], buyerView: 'venue3d' } },
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      builders: { venue3D: venue }, onCheckout: checkout,
    })); });
    expect(venue).not.toHaveBeenCalled();
    expect(state.scope.lease.set).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('has one phone bottom-safe owner and never transports the device inset as a map band', async () => {
    const input = { bottom: 18, left: 6, right: 6, top: 12 };
    state.scope = scope({ snapshot: { categories: [], capabilities: [], event: { mode: 'live' }, map: { floors: [], buyerView: 'map' } } });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, safeAreaInsets: input, options: { chrome: { mapControls: false } },
    })); });
    const outer = tree.root.findByProps({ testID: 'seatlayer-adaptive-safe-content' });
    expect(outer.props.style[1]).toMatchObject({ paddingBottom: 18, paddingEnd: 6, paddingStart: 6, paddingTop: 12 });
    expect(tree.root.findByType('cart-sheet' as any).props.reserveBottomInset).toBe(false);
    expect(state.scope.lease.set).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, safeAreaInsets: input, options: { chrome: { cartSheet: false, mapControls: false } },
    })); });
    expect(tree.root.findByProps({ testID: 'seatlayer-phone-footer' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'seatlayer-adaptive-safe-content' }).props.style[1].paddingBottom).toBe(18);
    expect(state.scope.lease.set).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('uses the venue back-target offset for a wide test badge without map framing', async () => {
    const current = scope({
      snapshot: { categories: [], capabilities: ['venue3d'], event: { mode: 'test' }, map: { floors: [], buyerView: 'venue3d' } },
    });
    state.scope = current;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, {
      onCheckout: checkout, options: { layout: 'wide' },
    })); });
    expect(tree.root.findByType('test-badge' as any).parent?.props.style[1].top).toBe(62);
    expect(current.lease.set).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
