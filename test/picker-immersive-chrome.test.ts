import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove() {} }),
  },
  Animated: {
    Value: class { constructor(readonly value: number) {} },
    View: 'AnimatedView',
    timing: () => ({ start: () => undefined, stop: () => undefined }),
  },
  Easing: { bezier: () => 'ease' },
  I18nManager: { isRTL: false },
  StyleSheet: { create: <T>(value: T) => value, flatten: (value: unknown) => value },
  View: 'View', Text: 'Text', Pressable: 'Pressable',
}));

import {
  dispatchSeatLayerVenue3DNavigationMode,
  dispatchSeatLayerVenue3DAction,
  dispatchSeatLayerVenue3DBackOverride,
  dispatchSeatLayerVenue3DCameraAction,
  dispatchSeatLayerVenue3DSeatView,
  planSeatLayerVenue3DAction,
  projectSeatLayerPanoramaWording,
  resolveSeatLayerPickerImmersiveTheme,
  seatLayerImmersiveDuration,
  seatLayerImmersiveInsetPlan,
  seatLayerImmersiveRequestIsCurrent,
  seatLayerPanoramaHasContent,
  seatLayerPanoramaIsOwned,
  seatLayerVenue3DIsOwned,
  seatLayerVenue3DHasFocusedView,
  seatLayerVenue3DNavigationIsOwned,
  seatLayerVenue3DCaption,
  seatLayerVenue3DNeighbours,
} from '../src/picker/immersiveChrome';
import { SeatLayerSeatPanoramaChromeView } from '../src/picker/SeatLayerSeatPanoramaChrome';
import { SeatLayerVenue3DChromeView } from '../src/picker/SeatLayerVenue3DChrome';
import { resolveSeatLayerPickerMapChromeTheme } from '../src/picker/mapChromeTheme';
import { resolveSeatLayerPickerTheme } from '../src/picker/theme';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const theme = {
  colors: {
    accent: '#ffcc00', background: '#fafafa', divider: '#dddddd', error: '#cc0000',
    mapBackground: '#ffffff', mapRowLabel: '#333333', mapSelection: '#0000ff', mapText: '#111111',
    mutedText: '#666666', onAccent: '#000000', surface: '#ffffff', text: '#111111',
  },
  fontFamily: undefined,
  layout: { minimumHitTarget: 44 },
  motion: seatLayerPickerTokens.motion,
  radius: 8,
  themeMode: 'light',
} as any;

function snapshot(targetId = 'seat-2'): any {
  const selection = [
    { id: 'seat-1', sectionLabel: 'Stalls', rowLabel: 'A', seatNumber: '1' },
    { id: 'seat-2', sectionLabel: 'Stalls', rowLabel: 'A', seatNumber: '2' },
    { id: 'seat-3', sectionLabel: 'Stalls', rowLabel: 'A', seatNumber: '3' },
  ];
  const index = selection.findIndex((seat) => seat.id === targetId);
  return {
    sessionId: 'runtime-1',
    capabilities: ['venue3d', 'seatView'],
    map: {
      buyerView: 'venue3d', focusedSectionId: 'stalls', rung: 'seats',
      view3DTargetSeatId: targetId, view3DTargetSeat: selection[index],
      view3DPreviousSeatId: index > 0 ? selection[index - 1]!.id : null,
      view3DNextSeatId: index >= 0 && index + 1 < selection.length ? selection[index + 1]!.id : null,
      view3DFocusedSectionId: 'stalls',
    },
    selection,
  };
}

describe('immersive venue and panorama chrome', () => {
  it('gates venue and panorama ownership on their exact data and bridge legs', () => {
    expect(seatLayerVenue3DIsOwned({ buyerView: 'venue3d', hasSnapshotFeature: true, nativeContract: true, setBuyerView: true })).toBe(true);
    expect(seatLayerVenue3DIsOwned({ buyerView: 'map', hasSnapshotFeature: true, nativeContract: true, setBuyerView: true })).toBe(false);
    expect(seatLayerVenue3DIsOwned({ buyerView: 'venue3d', hasSnapshotFeature: false, nativeContract: true, setBuyerView: true })).toBe(false);
    expect(seatLayerVenue3DNavigationIsOwned({ buyerView: 'venue3d', hasSnapshotFeature: true, nativeContract: true, setBuyerView: true, navigationCapability: true, setNavigationMode: true })).toBe(true);
    expect(seatLayerVenue3DNavigationIsOwned({ buyerView: 'venue3d', hasSnapshotFeature: true, nativeContract: true, setBuyerView: true, navigationCapability: false, setNavigationMode: true })).toBe(false);
    expect(seatLayerVenue3DNavigationIsOwned({ buyerView: 'venue3d', hasSnapshotFeature: true, nativeContract: true, setBuyerView: true, navigationCapability: true, setNavigationMode: false })).toBe(false);
    const view = { title: 'View from A2', real: true, generated: false, dragHint: 'Drag' };
    expect(seatLayerPanoramaHasContent(view)).toBe(true);
    expect(seatLayerPanoramaHasContent({ real: false, generated: true })).toBe(false);
    expect(projectSeatLayerPanoramaWording({ title: '  ', caption: '\n Details ', badge: ' ', dragHint: ' \t ', real: false, generated: false }))
      .toEqual({ title: undefined, caption: 'Details', badge: undefined, dragHint: undefined, summary: 'Details' });
    expect(seatLayerPanoramaIsOwned({ hasContent: true, hasSnapshotFeature: true, nativeContract: true, nativeSeatViewCapability: true, seatViewEvent: true })).toBe(true);
    expect(seatLayerPanoramaIsOwned({ hasContent: true, hasSnapshotFeature: true, nativeContract: true, nativeSeatViewCapability: true, seatViewEvent: false })).toBe(false);
    expect(seatLayerPanoramaIsOwned({ hasContent: true, hasSnapshotFeature: false, nativeContract: true, nativeSeatViewCapability: true, seatViewEvent: true })).toBe(false);
  });

  it('uses exact buyer-view payloads and has no adjacent action beyond the selected boundaries', async () => {
    const state = snapshot();
    const venueOverview = snapshot();
    venueOverview.map.view3DTargetSeatId = undefined;
    venueOverview.map.view3DTargetSeat = undefined;
    venueOverview.map.view3DPreviousSeatId = null;
    venueOverview.map.view3DNextSeatId = null;
    venueOverview.map.view3DFocusedSectionId = null;
    venueOverview.map.focusedSectionId = undefined;
    venueOverview.map.rung = 'overview';
    const focusedSection = snapshot();
    focusedSection.map.view3DTargetSeatId = undefined;
    focusedSection.map.view3DTargetSeat = undefined;
    expect(seatLayerVenue3DNeighbours(state)).toMatchObject({ previousSeatId: 'seat-1', target: { id: 'seat-2' }, targetSeatId: 'seat-2', nextSeatId: 'seat-3' });
    expect(planSeatLayerVenue3DAction('back', state)).toEqual({ view: 'venue3d', options: { resetView: true } });
    expect(seatLayerVenue3DHasFocusedView(focusedSection)).toBe(true);
    expect(planSeatLayerVenue3DAction('back', focusedSection)).toEqual({ view: 'venue3d', options: { resetView: true } });
    expect(planSeatLayerVenue3DAction('back', venueOverview)).toEqual({ view: 'map' });
    expect(planSeatLayerVenue3DAction('reset', state)).toEqual({ view: 'venue3d', options: { resetView: true } });
    expect(planSeatLayerVenue3DAction('previous', state)).toEqual({ view: 'venue3d', options: { flyToSeatId: 'seat-1' } });
    expect(planSeatLayerVenue3DAction('next', state)).toEqual({ view: 'venue3d', options: { flyToSeatId: 'seat-3' } });
    const recentre = planSeatLayerVenue3DAction('recentre', state)!;
    const setBuyerView = vi.fn().mockResolvedValue(undefined);
    await dispatchSeatLayerVenue3DAction({ setBuyerView }, recentre);
    expect(setBuyerView).toHaveBeenCalledWith('venue3d', { flyToSeatId: 'seat-2', resetView: true });
    const setVenue3DNavigationMode = vi.fn().mockResolvedValue(undefined);
    await dispatchSeatLayerVenue3DNavigationMode({ setVenue3DNavigationMode }, 'pan');
    expect(setVenue3DNavigationMode).toHaveBeenCalledWith('pan');
    const openSeatView = vi.fn().mockResolvedValue(undefined);
    await dispatchSeatLayerVenue3DSeatView({ openSeatView }, 'seat-2');
    expect(openSeatView).toHaveBeenCalledWith('seat-2');
    const camera = { zoomIn: vi.fn(), zoomOut: vi.fn(), zoomToFit: vi.fn() };
    await dispatchSeatLayerVenue3DCameraAction(camera, 'fit');
    expect(camera.zoomToFit).toHaveBeenCalledOnce();
    const override = vi.fn().mockResolvedValue(undefined);
    await dispatchSeatLayerVenue3DBackOverride(override);
    expect(override).toHaveBeenCalledOnce();
    expect(planSeatLayerVenue3DAction('previous', snapshot('seat-1'))).toBeUndefined();
    expect(planSeatLayerVenue3DAction('next', snapshot('seat-3'))).toBeUndefined();
  });

  it('uses generated identity templates for the caption rather than raw row and seat fragments', () => {
    const translate = vi.fn((key: string, options?: { values?: Record<string, string> }) => {
      if (key === 'rowIdentity') return `ROW(${options?.values?.row})`;
      if (key === 'seatNumberIdentity') return `SEAT(${options?.values?.seat})`;
      return options?.values?.parts ?? key;
    });
    expect(seatLayerVenue3DCaption(snapshot().selection[1], undefined, translate, 'VIEW')).toBe('Stalls · ROW(A) · SEAT(2) · VIEW');
    expect(translate).toHaveBeenCalledWith('rowIdentity', { values: { row: 'A' } });
    expect(translate).toHaveBeenCalledWith('seatNumberIdentity', { values: { seat: '2' } });
  });

  it('quarantines retained immersive work across controller, scope, and runtime-session replacement', () => {
    const origin = { controller: {}, scopeSessionId: 7, runtimeSessionId: 'one' };
    expect(seatLayerImmersiveRequestIsCurrent(origin, { ...origin })).toBe(true);
    expect(seatLayerImmersiveRequestIsCurrent(origin, { ...origin, scopeSessionId: 8 })).toBe(false);
    expect(seatLayerImmersiveRequestIsCurrent(origin, { ...origin, runtimeSessionId: 'two' })).toBe(false);
    expect(seatLayerImmersiveRequestIsCurrent(origin, { ...origin, controller: {} })).toBe(false);
  });

  it('renders a dark, fixed-target venue overlay despite hostile local geometry styles', () => {
    const immersive = resolveSeatLayerPickerImmersiveTheme(theme);
    const mapChrome = resolveSeatLayerPickerMapChromeTheme(resolveSeatLayerPickerTheme({
      themeMode: 'light',
      theme: { colors: { accent: '#ffcc00' } },
    }), snapshot());
    expect(immersive.themeMode).toBe('dark');
    expect(immersive.colors.accent).toBe('#ffcc00');
    expect(mapChrome.colors.mapBackground).toBe(seatLayerPickerTokens.color.dark.mapBackground);
    expect(mapChrome.colors.accent).toBe('#ffcc00');
    const onNavigation = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerVenue3DChromeView, {
        backVisible: true, backLabel: 'Back', bottomInset: 12, caption: 'Stalls · A · 2 · view from your seat',
        disabled: false, navigationEnabled: true, navigationLabel: 'Drag to rotate venue',
        nextEnabled: true, nextLabel: 'Next', onBack: vi.fn(), onNavigation,
        onNext: vi.fn(), onPrevious: vi.fn(), onPrimary: vi.fn(), onRecentre: vi.fn(),
        onZoomIn: vi.fn(), onZoomOut: vi.fn(), primaryLabel: 'View from here', primaryVisible: true,
        previousEnabled: true, previousLabel: 'Previous', recentreEnabled: true,
        recentreLabel: 'Recentre', targeted: true, zoomInLabel: 'Zoom in', zoomOutLabel: 'Zoom out',
        style: { height: 1, position: 'relative', backgroundColor: '#123456' } as any,
        theme: immersive, topInset: 12,
      }));
    });
    const buttons = renderer!.root.findAllByType('Pressable' as any);
    expect(buttons).toHaveLength(6);
    for (const button of buttons) {
      expect(button.props.style({ pressed: false })).toMatchObject({ height: 44, minWidth: 44 });
    }
    const rootStyle = renderer!.root.findByType('View' as any).props.style as readonly unknown[];
    expect(rootStyle).toContainEqual({ backgroundColor: '#123456' });
    expect(rootStyle).toContainEqual({ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 });
    act(() => buttons[1]!.props.onPress());
    expect(onNavigation).toHaveBeenCalledOnce();
    act(() => renderer!.unmount());
  });

  it('uses camera controls without a duplicate back control at the 3D overview', () => {
    const immersive = resolveSeatLayerPickerImmersiveTheme(theme);
    const onFit = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerVenue3DChromeView, {
        backVisible: false, backLabel: 'Back', bottomInset: 12, disabled: false,
        navigationEnabled: false, nextEnabled: false, nextLabel: 'Next',
        onBack: vi.fn(), onNext: vi.fn(), onPrevious: vi.fn(), onPrimary: onFit,
        onRecentre: vi.fn(), onZoomIn: vi.fn(), onZoomOut: vi.fn(),
        previousEnabled: false, previousLabel: 'Previous', primaryLabel: 'Fit to screen',
        primaryVisible: true, recentreEnabled: false, recentreLabel: 'Recentre',
        targeted: false, theme: immersive, topInset: 12,
        zoomInLabel: 'Zoom in', zoomOutLabel: 'Zoom out',
      }));
    });
    const labels = renderer!.root.findAllByType('Text' as any).map((node) => node.children.join(''));
    expect(labels).not.toContain('Back');
    expect(labels).toContain('Fit to screen');
    expect(renderer!.root.findAllByType('Pressable' as any)).toHaveLength(3);
    act(() => renderer!.root.findByProps({ accessibilityLabel: 'Fit to screen' }).props.onPress());
    expect(onFit).toHaveBeenCalledOnce();
    act(() => renderer!.unmount());
  });

  it('keeps panorama wording pointer-transparent and media-free while honoring its dark theme and insets', () => {
    const immersive = resolveSeatLayerPickerImmersiveTheme(theme);
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerSeatPanoramaChromeView, {
        bottomInset: 20, theme: immersive, topInset: 18,
        view: { badge: 'Preview', caption: 'About 18m from stage', dragHint: 'Drag to look around', generated: true, real: false, title: 'View from Stalls A2' },
      }));
    });
    expect(renderer!.root.findByType('View' as any).props.pointerEvents).toBe('none');
    expect(renderer!.root.findAllByType('Pressable' as any)).toHaveLength(0);
    expect(renderer!.root.findAllByType('Image' as any)).toHaveLength(0);
    expect(renderer!.root.findAllByType('Text' as any).map((node) => node.children.join(''))).not.toContain('Drag to look around');
    expect(renderer!.root.findAllByProps({ accessible: true })[0]?.props.accessibilityLabel).toBe('View from Stalls A2');
    const strip = renderer!.root.findAllByType('View' as any).find((node) =>
      Array.isArray(node.props.style) && node.props.style.some((style: unknown) =>
        typeof style === 'object' && style !== null && (style as { gap?: number }).gap === 10,
      ),
    );
    expect(strip?.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ alignSelf: 'stretch', gap: 10 }),
    ]));
    expect(seatLayerImmersiveInsetPlan(true, 18, 20)).toEqual({ top: 62, bottom: 108 });
    expect(seatLayerImmersiveInsetPlan(false, 18, 20)).toBeUndefined();
    expect(seatLayerImmersiveDuration(true)).toBe(0);
    expect(seatLayerImmersiveDuration(false)).toBe(seatLayerPickerTokens.motion.duration.immersive);
    act(() => renderer!.unmount());
  });

  it('prints the runtime drag wording only through an explicit opt-in, never a native close control', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerSeatPanoramaChromeView, {
        bottomInset: 0, showDragHint: true, theme: resolveSeatLayerPickerImmersiveTheme(theme),
        topInset: 0,
        view: { dragHint: 'Drag to look around', generated: false, real: true, title: 'View from A2' },
      }));
    });
    expect(renderer!.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toContain('Drag to look around');
    expect(renderer!.root.findAllByType('Pressable' as any)).toHaveLength(0);
    act(() => renderer!.unmount());
  });

  it('trims runtime wording and gives the passive panorama one accessible fallback summary', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerSeatPanoramaChromeView, {
        bottomInset: 0, showDragHint: true, theme: resolveSeatLayerPickerImmersiveTheme(theme),
        topInset: 0,
        view: { badge: '  ', caption: '  About 18m  ', dragHint: '  ', generated: true, real: false, title: '  ' },
      }));
    });
    expect(renderer!.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toEqual(['About 18m']);
    expect(renderer!.root.findAllByProps({ accessible: true })[0]?.props.accessibilityLabel).toBe('About 18m');
    act(() => renderer!.unmount());
  });
});
