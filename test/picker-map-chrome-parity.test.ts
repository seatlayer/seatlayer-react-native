import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
}));
let accessAvailable = false;
vi.mock('../src/picker/accessibility', () => ({
  canRenderSeatLayerPickerAccessibilityFilters: () => accessAvailable,
  SeatLayerPickerAccessibilityFilters: 'AccessibilityFilters',
}));
vi.mock('../src/picker/SeatLayerPickerAccessibleStepper', () => ({
  SeatLayerPickerAccessibleStepper: 'AccessibleStepper',
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));

import {
  SeatLayerMapControls,
  seatLayerPickerMapCanStepBack,
  seatLayerPickerMapCanStepOut,
  seatLayerPickerMapZoomInRetired,
  seatLayerPickerMapControlsEdgeInset,
  seatLayerPickerMapControlsDiscBed,
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
  accessAvailable = false;
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
    const disc = light.root.findByProps({ accessibilityLabel: 'fitWholeVenue' });
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
    // The region's inset is measured to the DISC, so the anchor takes back the
    // reach the disc carries around itself.
    expect(anchors).toContainEqual(expect.objectContaining({
      bottom: 12 - seatLayerPickerMapControlsDiscBed,
      end: 12 - seatLayerPickerMapControlsDiscBed,
    }));
    // The track shares the price rail's line rather than the map's corner, so
    // its top is the rail band's own, not the corner inset.
    expect(anchors).toContainEqual(expect.objectContaining({
      end: 12, top: seatLayerPickerMapControlsRailTop - seatLayerPickerViewModeTrackInset,
    }));
  });

  it('never draws fit-to-screen, on either composition', async () => {
    // Two ways to frame the same flat venue on one composition is one too
    // many, and the one that went is the one a pinch already does. The phone
    // says `fitWholeVenue`; the immersive scene's Fit chip says the same word.
    setup();
    const phone = await render({ showZoomToFitControl: true, showZoomControls: true });
    expect(phone.root.findAllByProps({ accessibilityLabel: 'fitVenue' })).toHaveLength(0);
    expect(phone.root.findAllByProps({ accessibilityLabel: 'fitWholeVenue' })).toHaveLength(1);
    setup();
    const wide = await render({ compact: false, showZoomControls: true });
    expect(wide.root.findAllByProps({ accessibilityLabel: 'fitVenue' })).toHaveLength(0);
    expect(wide.root.findAllByProps({ accessibilityLabel: 'fitWholeVenue' })).toHaveLength(0);
  });

  it('keeps the zoom pair on wide, and only there', async () => {
    setup();
    const renderer = await render({ compact: false, showZoomControls: true });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'zoomIn' }).length)
      .toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'zoomOut' }).length)
      .toBeGreaterThan(0);
  });

  it('dims a disc in place: its ground stays, the ink and ring step back, the shadow goes', async () => {
    setup('light', { focusedSectionId: undefined, atVenueFit: true });
    const renderer = await render({ compact: false, showZoomControls: true });
    const back = renderer.root.findByProps({ accessibilityLabel: 'zoomOut' });
    expect(back.props.accessibilityState.disabled).toBe(true);
    const paint = back.findAllByType('View' as never)[0]!.props.style[0];
    // The GROUND is untouched — a wash over the whole disc read as a grey blot
    // on the light map and vanished on the dark one.
    expect(paint.backgroundColor).toBe(seatLayerPickerTokens.color.light.chrome);
    expect(paint.shadowOpacity).toBe(0);
    expect(paint.elevation).toBe(0);
    expect(paint.borderColor).not.toBe(seatLayerPickerTokens.color.light.chromeLine);
    const ink = back.findAllByType('View' as never)[1]!.props.style;
    expect(ink.opacity).toBe(seatLayerPickerTokens.opacity.mapControlDisabled);
    // Never a press-time wash: the disc says it cannot be pressed by itself.
    expect(back.props.style({ pressed: false }).opacity).toBe(1);
  });

  it('draws no \u2212 on the phone, and keeps the whole-venue disc live at the fit pose', async () => {
    // Owner, 2026-09-06: a \u2212 that only sometimes had a step to take read as a
    // control that sometimes worked. Pinch steps out; the disc below goes home.
    // Reference frames 01 (\u267f / + / framed dot) and 02 (\u267f / framed dot).
    setup('light', { atVenueFit: true, canZoomOut: false, focusedSectionId: undefined });
    const phone = await render({ showZoomControls: true, showZoomToFitControl: true });
    expect(phone.root.findAllByProps({ accessibilityLabel: 'zoomOut' })).toHaveLength(0);
    // ALWAYS live, never dimmed. The camera facts in a snapshot are only as
    // fresh as the last state change and a pinch changes none, so dimming this
    // one on a stale "already home" reading strands the buyer with nothing to
    // press. At the venue already the press is a harmless no-op.
    const home = phone.root.findByProps({ accessibilityLabel: 'fitWholeVenue' });
    expect(home.props.accessibilityState.disabled).toBe(false);
    expect(home.props.disabled).toBe(false);
  });

  it('lights \u2212 only among the seats, and only while the ladder has a rung', () => {
    // The wide disc alone. At a section's own frame the only step back is the
    // whole venue, which is a different control: two discs for one move read as
    // a puzzle.
    expect(seatLayerPickerMapCanStepOut({ rung: 'seats', canZoomOut: true })).toBe(true);
    expect(seatLayerPickerMapCanStepOut({ rung: 'sections', canZoomOut: true })).toBe(false);
    expect(seatLayerPickerMapCanStepOut({ rung: 'seats', atVenueFit: true, canZoomOut: true }))
      .toBe(false);
    // A framed section still has a rung, so the seats rung is what decides.
    expect(seatLayerPickerMapCanStepOut({
      rung: 'seats', focusedSectionId: 's', atVenueFit: true, canZoomOut: false,
    })).toBe(true);
    expect(seatLayerPickerMapCanStepOut({ rung: 'seats', canZoomOut: false })).toBe(false);
  });

  it('holds \u2212 dark on the wide rail while a section is merely framed', async () => {
    setup('light', { rung: 'sections', canZoomOut: true });
    const wide = await render({ compact: false, showZoomControls: true });
    expect(wide.root.findByProps({ accessibilityLabel: 'zoomOut' })
      .props.accessibilityState.disabled).toBe(true);
    setup('light', { rung: 'seats', canZoomOut: true });
    const seats = await render({ compact: false, showZoomControls: true });
    expect(seats.root.findByProps({ accessibilityLabel: 'zoomOut' })
      .props.accessibilityState.disabled).toBe(false);
  });

  it('reads the fit pose, and never reads an absent one', () => {
    // §3.5 / §4.9. A framed section always has a rung left; otherwise the fit
    // pose decides; where the runtime does not report it, `canZoomOut` is the
    // older, coarser fallback. ABSENT must never be read as `false`.
    expect(seatLayerPickerMapCanStepBack({ focusedSectionId: 's', atVenueFit: true, canZoomOut: false }))
      .toBe(true);
    expect(seatLayerPickerMapCanStepBack({ atVenueFit: true, canZoomOut: true })).toBe(false);
    expect(seatLayerPickerMapCanStepBack({ atVenueFit: false, canZoomOut: false })).toBe(true);
    expect(seatLayerPickerMapCanStepBack({ canZoomOut: false })).toBe(false);
    expect(seatLayerPickerMapCanStepBack({ canZoomOut: true })).toBe(true);
    expect(seatLayerPickerMapZoomInRetired({ canZoomOut: true })).toBe(false);
    expect(seatLayerPickerMapZoomInRetired({ rung: 'seats', canZoomOut: true })).toBe(true);
    expect(seatLayerPickerMapZoomInRetired({ canZoomIn: false, canZoomOut: true })).toBe(true);
  });

  it('heads the control column with the accessibility disc, on both compositions', async () => {
    // Owner call 2026-09-06. It stood alone in the map's bottom-left corner —
    // one control facing a stack of them, in the corner the floor rail owns.
    // Who can sit where is an earlier question than how close the camera is.
    for (const compact of [true, false]) {
      setup();
      accessAvailable = true;
      const renderer = await render({ compact, showZoomControls: true, showAccessibilityControl: true });
      const column = renderer.root.findByType('AccessibilityFilters' as never);
      // The SAME disc on both compositions: it floats on the map either way,
      // so the wide side does not get a labelled button of its own.
      expect(column.props.compact).toBe(true);
      const order = renderer.root.findAll(
        (node) => (node.type as unknown) === 'AccessibilityFilters' ||
          node.props?.accessibilityLabel === 'zoomIn',
        { deep: true },
      );
      expect(order[0]!.type as unknown).toBe('AccessibilityFilters');
      // The stepper rides BESIDE it, on its inner side, at `accessStepGap`.
      const row = renderer.root.findByType('AccessibleStepper' as never).parent!;
      expect(row.props.style).toMatchObject({
        flexDirection: 'row',
        gap: seatLayerPickerTokens.size.accessStepGap,
      });
    }
  });

  it('takes the disc column off the map while a seat card asks', async () => {
    // Reference frame 19: \u267f, `+` and the framed dot are ABSENT, not merely
    // faded (0.8.0 faded them). The Dart carries this as an AnimatedOpacity to
    // ZERO under an IgnorePointer rather than an unmount, so the column keeps
    // its blocked-region rectangle and comes back without a relayout; the
    // buyer's reading of "gone" is the same either way.
    setup();
    const asking = await render({ cardAsking: true, showZoomControls: true });
    const root = asking.root.findAllByType('View' as never)[0]!;
    expect(root.props.pointerEvents).toBe('none');
    const style = root.props.style[root.props.style.length - 1];
    expect(style.opacity).toBe(0);
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
