import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ width: 320, scope: undefined as any, chartMounts: 0, accessibility: false, showToast: vi.fn(), fontScale: 1 }));

vi.mock('react-native', () => ({
  View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {} }, useWindowDimensions: () => ({ width: state.width }),
  StatusBar: 'StatusBar',
  PixelRatio: { getFontScale: () => state.fontScale },
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
import { seatLayerPickerReadingOrderIds } from '../src/picker/a11y';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rail = seatLayerPickerTokens.size.topRailHeight;
const clamp = seatLayerPickerTokens.type.scaleClamp.rail;

function scope(): any {
  const lease = { set: vi.fn(), remove: vi.fn() };
  return {
    controller: {
      mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true },
      setInteractionEnabled: vi.fn(() => Promise.resolve()), getGACandidate: () => undefined,
      subscribeGACandidate: () => () => undefined, getSnapshot: () => undefined,
    },
    sessionId: 1, isReady: true, pendingSeat: null, readOnly: false,
    snapshot: {
      revision: 1, sessionId: 'one', capabilities: [],
      map: { floors: [], buyerView: 'map' }, sections: [], selection: [], cart: { lines: [] },
      categories: [{ id: 'a', label: 'Stalls', color: '#123456', fromPrice: 1000 }],
      event: { key: 'e', name: 'Event', mode: 'live', currency: 'GBP', salesClosed: false },
    },
    presentation: { prompt: null, sheet: 'collapsed' }, setPresentation: vi.fn(),
    claimViewportInsetBand: () => lease, reportError: vi.fn(),
    resolvedTheme: { colors: { background: '#f6f7fb', surface: '#fff', divider: '#ddd' } }, styles: {},
    strings: { translate: (key: string) => key }, confirmPending: vi.fn(),
  };
}

async function bandHeight(fontScale: number): Promise<number | undefined> {
  state.fontScale = fontScale;
  state.width = 320;
  state.scope = scope();
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(SeatLayerPickerAdaptiveLayout, { onCheckout: () => undefined }));
  });
  await act(async () => {
    tree.root.find((node) => typeof node.props.testID === 'string' &&
      node.props.testID.startsWith('seatlayer-adaptive-'))
      .props.onLayout({ nativeEvent: { layout: { width: 320, height: 720 } } });
  });
  const band = tree.root.find((node) => node.props.nativeID === seatLayerPickerReadingOrderIds.rail);
  const height = [band.props.style].flat(3).reverse()
    .map((entry: any) => entry?.height).find((value: unknown) => typeof value === 'number');
  await act(async () => { tree.unmount(); });
  state.fontScale = 1;
  return height;
}

describe('§4.10 heights follow the type', () => {
  it('changes nothing at the platform default of 1.0', async () => {
    expect(await bandHeight(1)).toBe(rail);
  });

  it('grows the price band by the clamped scale', async () => {
    expect(await bandHeight(1.2)).toBeCloseTo(rail * 1.2, 6);
  });

  it('stops at the rail ceiling — past it the surface would clip', async () => {
    expect(await bandHeight(4)).toBeCloseTo(rail * clamp, 6);
  });

  it('never shrinks the band for a buyer who made their text smaller', async () => {
    expect(await bandHeight(0.8)).toBe(rail);
  });
});

describe('§4.10 every surface declares its ceiling', () => {
  const surfaces: ReadonlyArray<readonly [string, keyof typeof seatLayerPickerTokens.type.scaleClamp]> = [
    ['SeatLayerPriceLegend.tsx', 'rail'],
    ['SeatLayerDockBar.tsx', 'dock'],
    ['cartPeekHead.tsx', 'peek'],
    ['SeatLayerCartList.tsx', 'sheet'],
    ['SeatLayerCartSheet.tsx', 'sheet'],
    ['SeatLayerBestSeatsForm.tsx', 'sheet'],
    ['SeatLayerConfirmCard.tsx', 'card'],
    ['confirmCardParts.tsx', 'card'],
    ['SeatLayerPickerStateOverlays.tsx', 'state'],
  ];

  it.each(surfaces)('clamps every string in %s at its own ceiling', async (file, surface) => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL(`../src/picker/${file}`, import.meta.url), 'utf8');
    // `<TextStyle` and `<TextInput` are not strings on screen, and a glyph
    // drawn as an icon opts out of scaling entirely rather than being clamped.
    const drawn = [...source.matchAll(/<Text(?![A-Za-z])/g)].length -
      [...source.matchAll(/allowFontScaling=\{false\}/g)].length;
    const clamped = [...source.matchAll(/maxFontSizeMultiplier=/g)].length;
    expect(clamped).toBeGreaterThanOrEqual(drawn);
    expect(source).toContain(surface);
  });

  it('leaves the prompts and dialogs unclamped — they own the screen and scroll', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../src/picker/SeatLayerPickerDecisionPrompts.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('maxFontSizeMultiplier');
    expect(seatLayerPickerTokens.type.scaleClamp).not.toHaveProperty('prompt');
  });
});
