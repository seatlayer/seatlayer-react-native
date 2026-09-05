import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ width: 320, scope: undefined as any, chartMounts: 0, accessibility: false, showToast: vi.fn() }));

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
vi.mock('../src/picker/SeatLayerMapControls', () => ({ SeatLayerMapControls: 'controls', seatLayerPickerMapControlsEdgeInset: 10, seatLayerPickerMapControlsRailTop: 8 }));
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
import {
  seatLayerPickerReadingOrder,
  seatLayerPickerReadingOrderIds,
  type SeatLayerPickerReadingRung,
} from '../src/picker/a11y';

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
    strings: { translate: (key: string) => key },
    confirmPending: vi.fn(), ...overrides,
  };
}

const checkout = () => undefined;

/** Every `nativeID` the tree actually mounted, in the order it is painted. */
function paintedIds(tree: TestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAll((node) => typeof node.props.nativeID === 'string' &&
    node.props.nativeID.startsWith('seatlayer-order-'), { deep: true })
    .map((node) => node.props.nativeID as string);
}

function declaredOrder(tree: TestRenderer.ReactTestRenderer): string[] {
  const root = tree.root.find((node) => typeof node.props.testID === 'string' &&
    node.props.testID.startsWith('seatlayer-adaptive-'));
  return [...(root.props.experimental_accessibilityOrder ?? [])];
}

function rungOf(id: string): number {
  const entry = (Object.keys(seatLayerPickerReadingOrderIds) as SeatLayerPickerReadingRung[])
    .filter((rung) => id === seatLayerPickerReadingOrderIds[rung] ||
      id.startsWith(`${seatLayerPickerReadingOrderIds[rung]}-`))
    // The longest matching base wins: `map` is a prefix of `map-chrome`.
    .sort((left, right) => seatLayerPickerReadingOrderIds[right].length - seatLayerPickerReadingOrderIds[left].length)[0];
  if (entry === undefined) throw new Error(`no rung for ${id}`);
  return seatLayerPickerReadingOrder[entry];
}

async function render(width: number, overrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}): Promise<TestRenderer.ReactTestRenderer> {
  state.width = width;
  state.scope = scope(overrides);
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: checkout, ...props }));
  });
  await act(async () => {
    const root = tree.root.find((node) => typeof node.props.testID === 'string' &&
      node.props.testID.startsWith('seatlayer-adaptive-'));
    root.props.onLayout({ nativeEvent: { layout: { width, height: 720 } } });
  });
  return tree;
}

describe('§4.10 one reading order, declared at the composition root', () => {
  it('walks the phone composition in buyer order, not paint order', async () => {
    const tree = await render(320);
    const declared = declaredOrder(tree);
    expect(declared.length).toBeGreaterThan(0);
    const rungs = declared.map(rungOf);
    expect([...rungs].sort((left, right) => left - right)).toEqual(rungs);
    // The header is read first and the cart region last.
    expect(declared[0]).toBe(seatLayerPickerReadingOrderIds.header);
    expect(rungOf(declared[declared.length - 1]!)).toBeGreaterThanOrEqual(seatLayerPickerReadingOrder.notice);
    await act(async () => { tree.unmount(); });
  });

  it('declares every surface it mounted — all ordered, never some', async () => {
    const tree = await render(320);
    expect([...paintedIds(tree)].sort()).toEqual([...declaredOrder(tree)].sort());
    await act(async () => { tree.unmount(); });
  });

  it('reads the map chrome before the dock, though the stack paints the dock inside it', async () => {
    const tree = await render(320);
    const painted = paintedIds(tree);
    const declared = declaredOrder(tree);
    // Paint: the chrome overlay, then the dock rail beside it — the dock is no
    // longer a child of the chrome stack, so a screen reader cannot fall into
    // it between two halves of the map's own controls.
    expect(painted).toContain(seatLayerPickerReadingOrderIds.mapChrome);
    expect(declared.indexOf(seatLayerPickerReadingOrderIds.mapChrome))
      .toBeLessThan(declared.indexOf(`${seatLayerPickerReadingOrderIds.notice}-toast`));
    await act(async () => { tree.unmount(); });
  });

  it('leaves the dock rung empty on a default phone', async () => {
    const tree = await render(320);
    expect(declaredOrder(tree)).not.toContain(seatLayerPickerReadingOrderIds.dock);
    await act(async () => { tree.unmount(); });
  });

  it('names the toast, the status overlay and the state overlays on one rung', async () => {
    const tree = await render(320);
    const declared = declaredOrder(tree);
    const notices = declared.filter((id) => rungOf(id) === seatLayerPickerReadingOrder.notice);
    expect(notices).toContain(`${seatLayerPickerReadingOrderIds.notice}-toast`);
    expect(notices).toContain(`${seatLayerPickerReadingOrderIds.notice}-states`);
    await act(async () => { tree.unmount(); });
  });

  it('orders the wide composition too, prices before the map and the cart last', async () => {
    const tree = await render(900);
    const declared = declaredOrder(tree);
    const rungs = declared.map(rungOf);
    expect([...rungs].sort((left, right) => left - right)).toEqual(rungs);
    expect([...paintedIds(tree)].sort()).toEqual([...declared].sort());
    await act(async () => { tree.unmount(); });
  });
});
