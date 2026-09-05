import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove() {} }),
  },
  I18nManager: { isRTL: false },
  StyleSheet: {
    create: <T>(value: T) => value,
    flatten: (value: unknown) => value === 7 ? { color: '#abcdef' } : value,
    hairlineWidth: 1,
  },
  View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', Modal: 'Modal',
  ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
}));

import {
  planSeatLayerPickerAccessibilityMutations,
  resolveSeatLayerPickerAccessNeeds,
  shouldFocusSeatLayerAccessibilityResults,
} from '../src/picker/accessibility';
import { parseSeatLayerPickerColor, pickerColor, seatLayerPickerColorAlpha } from '../src/picker/colors';
import { chartSeatLayerPickerColor } from '../src/picker/chartColor';
import {
  planSeatLayerDock,
  seatLayerDockInitialOpacity,
  resolveSeatLayerDockMotionDuration,
  seatLayerDockTravelDistance,
  shouldRetainSeatLayerDock,
} from '../src/picker/SeatLayerDockBar';
import { canOfferSeatLayerAllFloors, isSeatLayerPickerFloorSelectionEnabled } from '../src/picker/SeatLayerFloorStrip';
import { planSeatLayerMapBottomControls } from '../src/picker/SeatLayerMapControls';
import {
  seatLayerPickerContrastRatio,
  seatLayerPickerTestChipContrastFloor,
  seatLayerPickerTestChipWash,
} from '../src/picker/testChipInk';
import {
  priceLegendEdges,
  priceLegendFadeSteps,
  priceLegendVisualContentWidth,
  priceLegendMeasurementSignature,
} from '../src/picker/SeatLayerPriceLegend';
import { resolveSeatLayerPickerLayout } from '../src/picker/layout';
import { sanitizeSeatLayerPickerStyle, seatLayerPickerMinimumTargetStyle } from '../src/picker/styles';
import { resolveSeatLayerPickerStyles } from '../src/picker/styles';
import { SeatLayerPickerHeaderView } from '../src/picker/header';
import { SeatLayerPickerHoldCountdownView } from '../src/picker/SeatLayerPickerHoldCountdown';
import { SeatLayerPickerErrorStatus, SeatLayerPickerTestModeIndicatorView } from '../src/picker/status';
import { SeatLayerPickerAttributionView } from '../src/picker/attribution';
import {
  focusedPickerSection,
  seatsLeftInPickerSection,
  usePickerSingleFlight,
} from '../src/picker/pickerNavigation';

function FlightHarness({
  sessionId,
  action,
  reportError,
}: {
  readonly sessionId: number;
  readonly action: () => Promise<unknown>;
  readonly reportError: (error: unknown) => void;
}): React.ReactElement {
  const [busy, run] = usePickerSingleFlight(sessionId, reportError, action);
  return React.createElement('flight-harness', { busy, run });
}

describe('picker chrome pure plans', () => {
  it('keeps React Native #RRGGBBAA distinct from chart ARGB transport', () => {
    expect(parseSeatLayerPickerColor('#80402010')).toEqual({ alpha: 16 / 255, red: 128, green: 64, blue: 32 });
    expect(parseSeatLayerPickerColor('#40201080')).toEqual({ alpha: 128 / 255, red: 64, green: 32, blue: 16 });
    expect(parseSeatLayerPickerColor('#abc')).toEqual({ alpha: 1, red: 170, green: 187, blue: 204 });
    expect(parseSeatLayerPickerColor('#abcd')).toEqual({ alpha: 221 / 255, red: 170, green: 187, blue: 204 });
    expect(seatLayerPickerColorAlpha('rgb(1,2,3)', .5)).toBe('rgba(1, 2, 3, 0.5)');
    expect(pickerColor('bad', '#010203ff')).toBe('bad');
    expect(chartSeatLayerPickerColor('#A5AEC23D', '#000000')).toBe(
      `rgba(174, 194, 61, ${165 / 255})`,
    );
    expect(seatLayerPickerColorAlpha('named-colour', .5)).toBe('rgba(0, 0, 0, 0)');
    expect(seatLayerPickerColorAlpha('transparent', .5)).toBe('rgba(0, 0, 0, 0)');
  });

  it('sanitizes hostile style objects without invoking getters', () => {
    const hostile = Object.create(null, {
      backgroundColor: { enumerable: true, value: '#123456' },
      height: { enumerable: true, value: 1 },
      position: { enumerable: true, value: 'absolute' },
      padding: { enumerable: true, value: 0 },
      width: { enumerable: true, get: () => { throw new Error('getter'); } },
    });
    expect(sanitizeSeatLayerPickerStyle([false, hostile, [{ opacity: 9, borderWidth: 99, borderRadius: 12, minHeight: 1 }]])).toEqual({ backgroundColor: '#123456', opacity: 1, borderWidth: 4, borderRadius: 12 });
  });

  it('drops proxy/accessor nesting and freezes a safe per-instance style copy', () => {
    const offset = new Proxy({}, {
      getOwnPropertyDescriptor: () => { throw new Error('offset trap'); },
    });
    const hostileArray = new Proxy([{ color: '#123456' }], {
      getOwnPropertyDescriptor: () => { throw new Error('array trap'); },
    });
    const safe = sanitizeSeatLayerPickerStyle([
      hostileArray,
      { color: '#123456', shadowOffset: offset, fontWeight: Number.POSITIVE_INFINITY },
    ] as never, true) as unknown as Record<string, unknown>;
    expect(safe).toEqual({ color: '#123456' });
    expect(Object.isFrozen(safe)).toBe(true);
    expect(sanitizeSeatLayerPickerStyle({ fontWeight: 700 }, true)).toEqual({ fontWeight: 700 });
    expect(sanitizeSeatLayerPickerStyle({ fontWeight: Number.NaN } as never, true)).toEqual({});
    expect(sanitizeSeatLayerPickerStyle(7 as never, true)).toEqual({ color: '#abcdef' });
    expect(sanitizeSeatLayerPickerStyle({ backgroundColor: 'not-a-native-colour' })).toEqual({});
  });

  it('keeps visual radii while rejecting layout padding and giving instances precedence', () => {
    const styles = resolveSeatLayerPickerStyles(
      { mapControlButton: { backgroundColor: '#111111', padding: 4 } },
      { mapControlButton: { backgroundColor: '#222222', borderRadius: 9, minHeight: 1 } },
    );
    expect(styles.mapControlButton).toEqual([
      { backgroundColor: '#111111' },
      { backgroundColor: '#222222', borderRadius: 9 },
    ]);
  });

  it('contains cyclic styles and rejects extreme layout values', () => {
    const cyclic: unknown[] = [];
    cyclic.push({ color: '#123456' }, cyclic);
    expect(sanitizeSeatLayerPickerStyle(cyclic as never, true)).toEqual({ color: '#123456' });
    expect(resolveSeatLayerPickerLayout({ headerHeight: 4096 }).headerHeight).toBe(4096);
    expect(resolveSeatLayerPickerLayout({ headerHeight: 4097 }).headerHeight).toBe(38);
    expect(seatLayerPickerMinimumTargetStyle(1)).toEqual({
      alignItems: 'center', justifyContent: 'center', minWidth: 44,
    });
  });

  it('emits each supported accessibility mutation once and in wire order', () => {
    const plan = planSeatLayerPickerAccessibilityMutations(
      { keys: new Set(['wheelchair']), limited: true, colorblind: true },
      { keys: new Set(), limited: false, colorblind: false },
      { accessibility: true, limited: true, colorblind: false },
    );
    expect(plan).toEqual([
      { kind: 'accessibility', keys: ['wheelchair'] },
      { kind: 'limited', on: true },
    ]);
  });

  it('uses only access needs reported by the event inventory', () => {
    expect(resolveSeatLayerPickerAccessNeeds([{ key: 'wheelchair', count: 2 }], true))
      .toEqual([{ key: 'wheelchair', count: 2 }]);
    expect(resolveSeatLayerPickerAccessNeeds([], true)).toEqual([]);
    expect(resolveSeatLayerPickerAccessNeeds([{ key: 'wheelchair', count: 2 }], false)).toEqual([]);
  });

  it('focuses matching seats only when an active map filter is being enabled', () => {
    expect(shouldFocusSeatLayerAccessibilityResults([
      { kind: 'accessibility', keys: ['wheelchair'] },
    ])).toBe(true);
    expect(shouldFocusSeatLayerAccessibilityResults([
      { kind: 'limited', on: true },
    ])).toBe(true);
    expect(shouldFocusSeatLayerAccessibilityResults([
      { kind: 'accessibility', keys: [] },
      { kind: 'limited', on: false },
      { kind: 'colorblind', on: true },
    ])).toBe(false);
  });

  it('keeps floor/all, dock, legend RTL, and phone control plans deterministic', () => {
    expect(canOfferSeatLayerAllFloors('all', true)).toBe(true);
    expect(canOfferSeatLayerAllFloors('stack', true)).toBe(false);
    expect(isSeatLayerPickerFloorSelectionEnabled(true, false)).toBe(false);
    expect(isSeatLayerPickerFloorSelectionEnabled(false, false)).toBe(true);
    expect(planSeatLayerMapBottomControls(true, false, true, 44)).toEqual({ height: 44, zoomOffset: 0 });
    expect(priceLegendEdges({ contentWidth: 300, layoutWidth: 100, offsetX: 0 }, true, 'reversed')).toEqual({ leading: true, trailing: false });
    expect(priceLegendFadeSteps(true, false)).toEqual([1, 0.5, 0.12]);
    expect(priceLegendFadeSteps(false, false)).toEqual([0.12, 0.5, 1]);
    expect(priceLegendFadeSteps(true, true)).toEqual([0.12, 0.5, 1]);
    expect(priceLegendFadeSteps(false, true)).toEqual([1, 0.5, 0.12]);
    // 3.2: the trailing breathing room is `size.legendRailEdgeFade`.
    expect(priceLegendVisualContentWidth(122)).toBe(104);
    expect(priceLegendVisualContentWidth(18)).toBe(0);
    expect(priceLegendMeasurementSignature(
      [{ key: 'a|b', label: 'Front', priceMin: 20 }], 'USD', false, false, 'auto', 44, 11,
    )).not.toBe(priceLegendMeasurementSignature(
      [{ key: 'a', label: 'b|Front', priceMin: 20 }], 'USD', false, false, 'auto', 44, 11,
    ));
    expect(priceLegendMeasurementSignature(
      [{ key: 'a', label: 'Front', priceMin: 20 }], 'USD', true, false, 'auto', 44, 11,
    )).not.toBe(priceLegendMeasurementSignature(
      [{ key: 'a', label: 'Front', priceMin: 20 }], 'USD', true, false, 'auto', 52, 13,
    ));
    expect(planSeatLayerDock(240, { name: 50, longCount: 80, shortCount: 20, overview: 45 }, true, 44)).toEqual({ count: 'hidden', labelled: true, lines: 2 });
    expect(planSeatLayerDock(390, { name: 70, longCount: 80, shortCount: 20, overview: 45 }, true, 44)).toMatchObject({ labelled: true });
    expect(resolveSeatLayerDockMotionDuration(true, 240)).toBe(0);
    expect(resolveSeatLayerDockMotionDuration(false, 240)).toBe(240);
    expect(seatLayerDockTravelDistance(52, 18)).toBe(70);
    expect(seatLayerDockInitialOpacity()).toBe(0);
    expect(shouldRetainSeatLayerDock(false, true, 1, 2)).toBe(false);
    expect(shouldRetainSeatLayerDock(false, true, 2, 2)).toBe(true);
  });

  it('fills a sparse focused-map record from the matching section summary', () => {
    const snapshot = {
      map: { focusedSection: { id: 'guest', label: 'Guest Tables' } },
      sections: [{
        id: 'guest', label: 'Guest tables', displayLabel: 'Guest Tables',
        seatsLeft: 88, dominantCategoryKey: 'guest', color: '#D45C87',
      }],
      selection: [{ sectionLabel: 'Guest Tables' }],
    } as any;
    const section = focusedPickerSection(snapshot)!;
    expect(section).toMatchObject({
      id: 'guest', label: 'Guest Tables', seatsLeft: 88,
      dominantCategoryKey: 'guest', color: '#D45C87',
    });
    expect(seatsLeftInPickerSection(section, snapshot)).toBe(87);
  });

  it('publishes a first-frame header reservation and avoids hidden-hold formatters', () => {
    const reportInset = vi.fn();
    const removeInset = vi.fn();
    const heldFor = vi.fn();
    const theme = {
      colors: { accent: '#111111', onAccent: '#ffffff', surface: '#ffffff', text: '#111111', mutedText: '#666666', divider: '#cccccc' },
      fontFamily: undefined,
    } as any;
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerPickerHeaderView, {
        title: 'Event', theme, closeLabel: 'Close', heldFor,
        reportInset, removeInset, reportError: vi.fn(),
        hold: { active: false }, sessionId: 1,
      }));
    });
    expect(reportInset).toHaveBeenCalledWith(38);
    expect(heldFor).not.toHaveBeenCalled();
    act(() => renderer!.unmount());
    expect(removeInset).toHaveBeenCalledOnce();
  });

  it('renders the standalone hold countdown only for a live hold and keeps tabular clock copy replaceable', () => {
    const heldFor = vi.fn((clock: string) => `Held ${clock}`);
    const theme = {
      colors: { accent: '#111111', surface: '#ffffff', text: '#111111' },
      fontFamily: undefined,
    } as any;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerPickerHoldCountdownView, {
        clock: () => 100_000,
        heldFor,
        hold: { active: true, expiresAt: 130_000 },
        theme,
      }));
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Held 00:30' })).toBeTruthy();
    expect(renderer.root.findByType('Text' as any).children).toEqual(['Held 00:30']);
    act(() => renderer.update(React.createElement(SeatLayerPickerHoldCountdownView, {
      clock: () => 100_000,
      heldFor,
      hold: { active: false },
      theme,
    })));
    expect(renderer.toJSON()).toBeNull();
  });

  it('keeps its header lease through top-inset and layout measurement changes', () => {
    const reportInset = vi.fn();
    const oldRemove = vi.fn();
    const newRemove = vi.fn();
    const theme = { colors: { accent: '#111', onAccent: '#fff', surface: '#fff', text: '#111', mutedText: '#666', divider: '#ccc' } } as any;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerPickerHeaderView, {
        title: 'Event', theme, closeLabel: 'Close', heldFor: (value: string) => value,
        reportInset, removeInset: oldRemove, reportError: vi.fn(), sessionId: 1, topInset: 0,
      }));
    });
    act(() => {
      renderer.update(React.createElement(SeatLayerPickerHeaderView, {
        title: 'Event', theme, closeLabel: 'Close', heldFor: (value: string) => value,
        reportInset, removeInset: oldRemove, reportError: vi.fn(), sessionId: 1, topInset: 9,
      }));
    });
    expect(oldRemove).not.toHaveBeenCalled();
    act(() => renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { height: 71 } } }));
    expect(reportInset).toHaveBeenLastCalledWith(71);
    act(() => {
      renderer.update(React.createElement(SeatLayerPickerHeaderView, {
        title: 'Event', theme, closeLabel: 'Close', heldFor: (value: string) => value,
        reportInset, removeInset: newRemove, reportError: vi.fn(), sessionId: 2, topInset: 9,
      }));
    });
    expect(oldRemove).toHaveBeenCalledOnce();
    act(() => renderer.unmount());
    expect(newRemove).toHaveBeenCalledOnce();
  });

  it('renders fixed 46/44 header action geometry and one error announcement', () => {
    const theme = {
      themeMode: 'light', colors: {
        accent: '#111111', onAccent: '#ffffff', surface: '#ffffff', background: '#ffffff',
        text: '#111111', mutedText: '#666666', divider: '#cccccc', warning: '#f4b740',
      }, fontFamily: undefined,
    } as any;
    const strings = { translate: (key: string) => key } as any;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerPickerHeaderView, {
        title: 'Event', theme, closeLabel: 'close', heldFor: (value: string) => value,
        reportInset: vi.fn(), removeInset: vi.fn(), reportError: vi.fn(), onClose: vi.fn(),
      }));
    });
    const close = renderer.root.findAllByType('Pressable' as any)[0]!;
    // Ring plus twenty points of reach, so the ring lands ten points from the
    // trailing edge while the target still runs out to the corner.
    expect(close.props.style({ pressed: false })[0]).toMatchObject({ width: 46, height: 44 });
    let error!: TestRenderer.ReactTestRenderer;
    act(() => {
      error = TestRenderer.create(React.createElement(SeatLayerPickerErrorStatus, {
        error: new Error('real'), theme, strings,
      }));
    });
    expect(error.root.findAll((node) => node.props.accessibilityRole === 'alert')).toHaveLength(1);
  });

  it('uses warning-specific ink and keeps required attribution non-customizable', () => {
    const theme = {
      themeMode: 'light', colors: {
        accent: '#111111', onAccent: '#ffffff', surface: '#ffffff', background: '#ffffff',
        text: '#111111', mutedText: '#666666', divider: '#cccccc', warning: '#f4b740',
      }, fontFamily: undefined,
    } as any;
    const strings = { translate: (key: string) => key } as any;
    let indicator!: TestRenderer.ReactTestRenderer;
    act(() => {
      indicator = TestRenderer.create(React.createElement(SeatLayerPickerTestModeIndicatorView, {
        testMode: true, theme, strings,
      }));
    });
    // 3.4: the ink is resolved against the chip's own wash, not the surface,
    // and must clear the small-text floor whatever the host theme.
    const warningText = indicator.root.findByType('Text' as any);
    const ink = (warningText.props.style as ReadonlyArray<Record<string, string>>)
      .find((entry) => typeof entry?.color === 'string')?.color;
    const wash = seatLayerPickerTestChipWash('#f4b740', '#ffffff', 0.18);
    expect(ink).toBeTypeOf('string');
    expect(seatLayerPickerContrastRatio(ink!, wash))
      .toBeGreaterThanOrEqual(seatLayerPickerTestChipContrastFloor);
    let attribution!: TestRenderer.ReactTestRenderer;
    act(() => {
      attribution = TestRenderer.create(React.createElement(SeatLayerPickerAttributionView, {
        required: true, label: 'poweredBy', textColor: '#111111',
        style: { opacity: 0, position: 'absolute' }, visible: false,
      }));
    });
    expect(attribution.root.findByType('View' as any).props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0 })]),
    );
  });

  it('does not report a retired retry completion after unmount', async () => {
    const theme = {
      themeMode: 'light', colors: {
        accent: '#111111', onAccent: '#ffffff', surface: '#ffffff', background: '#ffffff',
        text: '#111111', mutedText: '#666666', divider: '#cccccc', warning: '#f4b740',
      }, fontFamily: undefined,
    } as any;
    const report = vi.fn();
    let reject!: (reason: unknown) => void;
    const retry = () => new Promise<void>((_resolve, fail) => { reject = fail; });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SeatLayerPickerErrorStatus, {
        error: new Error('real'), theme, strings: { translate: (key: string) => key } as any,
        retry, onActionError: report, sessionId: 1,
      }));
    });
    const retryButton = tree.root.findAllByType('Pressable' as any)[0]!;
    act(() => retryButton.props.onPress());
    act(() => tree.unmount());
    await act(async () => { reject(new Error('late')); });
    expect(report).not.toHaveBeenCalled();
  });

  it('rejects retained header and retry presses after their session is replaced', () => {
    const theme = {
      themeMode: 'light', colors: {
        accent: '#111111', onAccent: '#ffffff', surface: '#ffffff', background: '#ffffff',
        text: '#111111', mutedText: '#666666', divider: '#cccccc', warning: '#f4b740',
      }, fontFamily: undefined,
    } as any;
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    let header!: TestRenderer.ReactTestRenderer;
    act(() => {
      header = TestRenderer.create(React.createElement(SeatLayerPickerHeaderView, {
        title: 'Event', theme, closeLabel: 'close', heldFor: (value: string) => value,
        reportInset: vi.fn(), removeInset: vi.fn(), reportError: vi.fn(), onClose: firstClose, sessionId: 1,
      }));
    });
    const retiredClose = header.root.findAllByType('Pressable' as any)[0]!.props.onPress;
    act(() => {
      header.update(React.createElement(SeatLayerPickerHeaderView, {
        title: 'Event', theme, closeLabel: 'close', heldFor: (value: string) => value,
        reportInset: vi.fn(), removeInset: vi.fn(), reportError: vi.fn(), onClose: secondClose, sessionId: 2,
      }));
    });
    act(() => retiredClose());
    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).not.toHaveBeenCalled();

    const firstRetry = vi.fn();
    const secondRetry = vi.fn();
    let status!: TestRenderer.ReactTestRenderer;
    act(() => {
      status = TestRenderer.create(React.createElement(SeatLayerPickerErrorStatus, {
        error: new Error('real'), theme, strings: { translate: (key: string) => key } as any,
        retry: firstRetry, sessionId: 1,
      }));
    });
    const retiredRetry = status.root.findAllByType('Pressable' as any)[0]!.props.onPress;
    act(() => {
      status.update(React.createElement(SeatLayerPickerErrorStatus, {
        error: new Error('real'), theme, strings: { translate: (key: string) => key } as any,
        retry: secondRetry, sessionId: 2,
      }));
    });
    const currentRetry = status.root.findAllByType('Pressable' as any)[0]!.props.onPress;
    act(() => retiredRetry());
    expect(firstRetry).not.toHaveBeenCalled();
    expect(secondRetry).not.toHaveBeenCalled();
    act(() => currentRetry());
    expect(secondRetry).toHaveBeenCalledOnce();
  });

  it('retires a committed flight when its picker session is replaced', async () => {
    const report = vi.fn();
    let reject!: (error: unknown) => void;
    const pending = () => new Promise<void>((_resolve, fail) => { reject = fail; });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(FlightHarness, {
        sessionId: 1, action: pending, reportError: report,
      }));
    });
    act(() => tree.root.findByType('flight-harness' as any).props.run());
    await act(async () => {
      tree.update(React.createElement(FlightHarness, {
        sessionId: 2, action: async () => undefined, reportError: report,
      }));
    });
    await act(async () => { reject(new Error('late')); });
    expect(report).not.toHaveBeenCalled();
    expect(tree.root.findByType('flight-harness' as any).props.busy).toBe(false);
  });
});
