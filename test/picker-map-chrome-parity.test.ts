import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock('../src/picker/accessibility', () => ({
  canRenderSeatLayerPickerAccessibilityFilters: () => false,
  SeatLayerPickerAccessibilityFilters: 'AccessibilityFilters',
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));

import {
  SeatLayerMapControls,
  seatLayerPickerMapControlsEdgeInset,
  seatLayerPickerMapControlsRailTop,
  seatLayerPickerViewModeTrackInset,
} from '../src/picker/SeatLayerMapControls';
import {
  SeatLayerPickerBlockedRegion,
  SeatLayerPickerBlockedRegionProvider,
} from '../src/picker/blockedRegionsContext';
import { SeatLayerPickerBlockedRegionRegistry } from '../src/picker/blockedRegions';
import { seatLayerPickerMapChromeGround } from '../src/picker/mapChromeTheme';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const layout = {
  mapControlSize: seatLayerPickerTokens.size.mapControlSize,
  minimumHitTarget: seatLayerPickerTokens.size.minimumHitTarget,
  viewModeButtonMinWidth: seatLayerPickerTokens.size.viewModeButtonMinWidth,
  viewModeLabelFontSize: seatLayerPickerTokens.size.viewModeLabelFontSize,
};

function setup(themeMode: 'light' | 'dark' = 'light', map: object = {}) {
  const commands = {
    setBuyerView: vi.fn(async () => undefined),
    zoomIn: vi.fn(async () => undefined),
    zoomOut: vi.fn(async () => undefined),
    zoomToFit: vi.fn(async () => undefined),
    overview: vi.fn(async () => undefined),
  };
  const snapshot: any = {
    sessionId: 'runtime', capabilities: ['venue3d'], sections: [{ id: 's', label: 'S' }],
    map: {
      buyerView: 'map', focusedSectionId: 's', canZoomIn: true, canZoomOut: true, ...map,
    },
  };
  scope = {
    controller: {
      ...commands,
      getSnapshot: () => snapshot,
      mapController: {
        isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true,
      },
    },
    snapshot, sessionId: 1, isBusy: false, readOnly: false, reportError: vi.fn(), styles: {},
    strings: { translate: (key: string) => key },
    resolvedTheme: {
      themeMode,
      colors: {
        accent: '#06f', divider: '#ccc', mutedText: '#667085', onAccent: '#fff',
        surface: '#fff', text: '#111',
      },
      fontFamily: 'Brand', layout, radii: { button: 8 }, roles: {},
    },
  };
  return commands;
}

async function render(props: object = {}): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(SeatLayerMapControls, {
      compact: true, showAccessibilityControl: false, ...props,
    } as never));
  });
  return renderer;
}

describe('3.5 map corner controls', () => {
  it('insets every floating control by size.mapAnchorInset', () => {
    expect(seatLayerPickerMapControlsEdgeInset).toBe(12);
    expect(seatLayerPickerTokens.size.mapAnchorGap).toBe(12);
  });

  it('gives a disc its own ground, never the panel plate it is drawn beside', async () => {
    setup('light');
    const light = await render();
    const disc = light.root.findByProps({ accessibilityLabel: 'zoomOut' });
    const paint = disc.findAllByType('View' as never)[0]!;
    expect(paint.props.style[0]).toMatchObject({
      backgroundColor: seatLayerPickerTokens.color.light.chrome,
      borderColor: seatLayerPickerTokens.color.light.chromeLine,
      height: seatLayerPickerTokens.size.mapControlSize,
    });
    expect(seatLayerPickerMapChromeGround({ themeMode: 'dark' } as never)).toEqual({
      ground: seatLayerPickerTokens.color.dark.chrome,
      line: seatLayerPickerTokens.color.dark.chromeLine,
    });
  });

  it('holds the two halves inside the track, each a stadium of its own', async () => {
    setup();
    const renderer = await render({ edgeInset: seatLayerPickerMapControlsEdgeInset });
    const target = seatLayerPickerTokens.size.minimumHitTarget;
    const trackInset = (target - seatLayerPickerTokens.size.viewModeControlHeight) / 2;
    const paintInset = (target - seatLayerPickerTokens.size.viewModeButtonHeight) / 2;
    const styles = renderer.root.findAllByType('View' as never)
      .flatMap((node) => Array.isArray(node.props.style) ? node.props.style : [node.props.style])
      .filter((style: unknown): style is Record<string, unknown> =>
        typeof style === 'object' && style !== null);

    // The bed is the whole control's height, so it shows around both halves.
    expect(styles).toContainEqual(expect.objectContaining({
      borderRadius: seatLayerPickerTokens.radius.pill,
      top: trackInset,
      bottom: trackInset,
    }));
    // The lit half is a stadium, not a half of a block butted against another.
    expect(styles).toContainEqual(expect.objectContaining({
      backgroundColor: '#06f',
      borderRadius: seatLayerPickerTokens.radius.pill,
      top: paintInset,
      bottom: paintInset,
    }));
    // The quiet half paints nothing of its own: the bed under it is the ground.
    expect(styles).toContainEqual(expect.objectContaining({
      backgroundColor: 'transparent',
      borderRadius: seatLayerPickerTokens.radius.pill,
    }));
    expect(styles.some((style) => style.columnGap === 2)).toBe(true);
  });

  it('anchors the narrow disc in the bottom-right and the Map|3D track top-right', async () => {
    setup();
    const renderer = await render({ edgeInset: seatLayerPickerMapControlsEdgeInset });
    const anchors = renderer.root.findAllByType('View' as never)
      .map((node) => node.props.style)
      .filter((style: unknown) => typeof style === 'object' && style !== null &&
        (style as Record<string, unknown>).position === 'absolute');
    expect(anchors).toContainEqual(expect.objectContaining({ bottom: 12, end: 12 }));
    // The track shares the price rail's line rather than the map's corner, so
    // its top is the rail band's own, not the corner inset.
    expect(anchors).toContainEqual(expect.objectContaining({
      end: 12, top: seatLayerPickerMapControlsRailTop - seatLayerPickerViewModeTrackInset,
    }));
  });

  it('never draws fit-to-screen on the phone', async () => {
    setup();
    const renderer = await render({ showZoomToFitControl: true, showZoomControls: true });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'fitVenue' })).toHaveLength(0);
  });

  it('keeps fit and the zoom pair on wide', async () => {
    setup();
    const renderer = await render({ compact: false, showZoomControls: true });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'fitVenue' }).length)
      .toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'zoomIn' }).length)
      .toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'zoomOut' }).length)
      .toBeGreaterThan(0);
  });
});

describe('3.3 Map | 3D control', () => {
  it('names the segments for a screen reader and the track for its group', async () => {
    setup();
    const renderer = await render();
    expect(renderer.root.findByProps({ accessibilityLabel: 'flat2dMap' }).props.accessibilityState)
      .toMatchObject({ selected: true });
    const venue = renderer.root.findByProps({ accessibilityLabel: 'interactive3dVenueView' });
    expect(venue.props.accessibilityState).toMatchObject({ selected: false });
    expect(renderer.root.findByProps({ accessibilityRole: 'tablist' }).props.accessibilityLabel)
      .toBe('venueView');
    expect(venue.props.style({ pressed: false })).toMatchObject({
      minWidth: seatLayerPickerTokens.size.viewModeButtonMinWidth,
    });
  });
});

describe('2.4 chrome on the map reports its rectangle', () => {
  it('measures a wrapped control against the map surface, and lingers on release', async () => {
    const draws: Array<() => void> = [];
    const sink = vi.fn(async () => undefined);
    const timers: Array<() => void> = [];
    const registry = new SeatLayerPickerBlockedRegionRegistry({
      scheduler: {
        requestAnimationFrame: (callback) => { draws.push(callback); return draws.length; },
        cancelAnimationFrame: () => undefined,
      },
      sink,
      supported: () => true,
      now: () => 0,
      setTimer: (callback) => { timers.push(callback); return timers.length; },
      clearTimer: () => undefined,
    });
    registry.setSurface({ x: 0, y: 100, width: 390, height: 600 });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        React.createElement(
          SeatLayerPickerBlockedRegionProvider,
          { registry, scheduler: null as never, sink, supported: () => true },
          React.createElement(SeatLayerPickerBlockedRegion, null, null),
        ),
        { createNodeMock: () => ({
          measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
            callback(334, 756, 44, 44),
        }) },
      );
    });
    expect(registry.regions()).toEqual([{ x: 334, y: 656, w: 44, h: 44 }]);
    await act(async () => { renderer.unmount(); });
    // Still guarded: a rect withdrawn on the unmount frame loses the same race a
    // pointer-down guard loses.
    expect(registry.regions()).toEqual([{ x: 334, y: 656, w: 44, h: 44 }]);
    expect(timers).toHaveLength(1);
  });
});
