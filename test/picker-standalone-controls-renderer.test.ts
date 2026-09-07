import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  SeatLayerPicker3DNavigationModeButton,
  SeatLayerPickerColorblindButton,
  SeatLayerPickerViewModeControl,
  SeatLayerPickerZoomInButton,
} from '../src/picker/SeatLayerPickerMapButtons';
import {
  SeatLayerPickerSeat3DButton,
  SeatLayerPickerSeatViewButton,
} from '../src/picker/SeatLayerPickerSeatInspectionButtons';
import { SeatLayerMapControls } from '../src/picker/SeatLayerMapControls';

function setup() {
  let sessionId = 1;
  let snapshot: any = {
    sessionId: 'runtime', capabilities: ['venue3d', 'seatView'],
    sections: [{ id: 's', label: 'Section' }],
    map: {
      buyerView: 'map', focusedSectionId: 's', canZoomIn: true, canZoomOut: true,
      colorblindSafe: false, view3DNavigationMode: 'orbit',
    },
  };
  const commands = {
    openSeatView: vi.fn(async () => undefined),
    setBuyerView: vi.fn(async () => undefined),
    setColorblindSafe: vi.fn(async () => undefined),
    setVenue3DNavigationMode: vi.fn(async () => undefined),
    zoomIn: vi.fn(async () => undefined),
    zoomOut: vi.fn(async () => undefined),
    zoomToFit: vi.fn(async () => undefined),
    overview: vi.fn(async () => undefined),
  };
  const controller = {
    ...commands,
    getSnapshot: () => snapshot,
    mapController: {
      isReady: true,
      supportsPickerCapability: () => true,
      supportsPickerCommand: () => true,
    },
  };
  const publish = () => {
    scope = {
      controller, snapshot, sessionId, isBusy: false, readOnly: false,
      reportError: vi.fn(), styles: {},
      strings: { translate: (key: string) => key },
      resolvedTheme: {
        colors: { accent: '#06f', divider: '#ccc', onAccent: '#fff', surface: '#fff', text: '#111' },
        fontFamily: 'Brand',
        layout: {
          mapControlSize: 40, minimumHitTarget: 44,
          viewModeButtonMinWidth: 38, viewModeLabelFontSize: 9.5,
        },
        radii: { button: 8 }, roles: {}, themeMode: 'light',
      },
    };
  };
  publish();
  return {
    commands,
    replaceSession: () => { sessionId += 1; publish(); },
    update: (next: any) => { snapshot = { ...snapshot, ...next, map: { ...snapshot.map, ...next.map } }; publish(); },
  };
}

beforeEach(() => { setup(); });

describe('standalone picker controls', () => {
  // §3.5 at 0.9.1: the phone's bottom-right column carries `+` and the
  // whole-venue disc, nothing between them. `-` is wide-only — pinch steps the
  // camera out, and the disc below goes home from any depth.
  const compactControls = {
    compact: true,
    enable3D: false,
    showAccessibilityControl: false,
    showZoomToFitControl: true,
    showZoomControls: true,
  } as const;

  it('carries + and the whole venue on the phone, and no - between them', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerMapControls, compactControls));
    });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'zoomOut' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'fitVenue' })).toHaveLength(0);
    const home = renderer.root.findByProps({ accessibilityLabel: 'fitWholeVenue' });
    await act(async () => { home.props.onPress(); });
    // `picker.overview`, never `picker.zoomToFit`: a framed section is released
    // by the same press that fits the chart.
    expect(runtime.commands.overview).toHaveBeenCalledOnce();
    expect(runtime.commands.zoomToFit).not.toHaveBeenCalled();
  });

  it('keeps the whole-venue disc live at the fit pose and on the older reading', async () => {
    // The camera facts in a snapshot are only as fresh as the last state
    // change and a pinch changes none, so a dimmed escape hatch stranded a
    // buyer on a stale reading.
    const runtime = setup(); let renderer!: ReactTestRenderer;
    runtime.update({ map: { atVenueFit: true, canZoomOut: false, focusedSectionId: undefined } });
    await act(async () => {
      renderer = create(React.createElement(SeatLayerMapControls, compactControls));
    });
    const home = renderer.root.findByProps({ accessibilityLabel: 'fitWholeVenue' });
    expect(home.props.accessibilityState.disabled).toBe(false);
    await act(async () => { home.props.onPress(); });
    expect(runtime.commands.overview).toHaveBeenCalledOnce();
  });

  it('retires + at the ceiling and among the seats, keeping its slot', async () => {
    // A disc that does nothing is the broken-map reading, so `+` goes; the
    // column is anchored at its FOOT, so the slot stays or the accessibility
    // disc above it moves under the thumb reaching for it.
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerMapControls, compactControls));
    });
    const live = renderer.root.findByProps({ accessibilityLabel: 'zoomIn' });
    expect(live.props.accessibilityState.disabled).toBe(false);

    for (const camera of [{ canZoomIn: false }, { rung: 'seats' }]) {
      runtime.update({ map: camera });
      await act(async () => {
        renderer.update(React.createElement(SeatLayerMapControls, compactControls));
      });
      const retired = renderer.root.findByProps({ accessibilityLabel: 'zoomIn' });
      expect(retired.props.accessibilityState.disabled).toBe(true);
      expect(retired.props.disabled).toBe(true);
      // THE SLOT STAYS. It is drawn away and takes no presses, but it still
      // occupies its target, so the disc above it does not move.
      const slot = renderer.root.findAllByType('View' as never).find((node) => {
        const style = node.props.style;
        return typeof style === 'object' && style !== null && !Array.isArray(style) &&
          (style as Record<string, unknown>).opacity === 0 &&
          (style as Record<string, unknown>).minHeight === 44;
      });
      expect(slot).toBeDefined();
      expect(slot?.props.pointerEvents).toBe('none');
      // AND IT IS SILENT. A slot drawn at nothing that still answered the
      // rotor was an invisible disabled button in the corner of the map.
      expect(slot?.props.accessibilityElementsHidden).toBe(true);
      expect(slot?.props.importantForAccessibility).toBe('no-hide-descendants');
      // The other disc is a different question and is unaffected by it: it
      // keeps its slot AND its voice.
      expect(renderer.root.findAllByProps({ accessibilityLabel: 'fitWholeVenue' }))
        .toHaveLength(1);
      const living = renderer.root.findAllByType('View' as never).find((node) => {
        const style = node.props.style;
        return typeof style === 'object' && style !== null && !Array.isArray(style) &&
          (style as Record<string, unknown>).opacity === 1 &&
          (style as Record<string, unknown>).minHeight === 44;
      });
      expect(living?.props.accessibilityElementsHidden).toBeUndefined();
      runtime.update({ map: { canZoomIn: true, rung: 'sections' } });
    }
  });

  it('never reads an ABSENT camera field as a ceiling', async () => {
    // `canZoomIn` is present-only: an older runtime leaves the key off, and
    // absent means "the engine cannot say", never "no".
    const runtime = setup(); let renderer!: ReactTestRenderer;
    runtime.update({ map: { canZoomIn: undefined, rung: 'sections' } });
    await act(async () => {
      renderer = create(React.createElement(SeatLayerMapControls, compactControls));
    });
    const older = renderer.root.findByProps({ accessibilityLabel: 'zoomIn' });
    expect(older.props.accessibilityState.disabled).toBe(false);
    await act(async () => { older.props.onPress(); });
    expect(runtime.commands.zoomIn).toHaveBeenCalledOnce();
  });

  it('keeps a 44-point zoom target, honors an aesthetic radius, and dispatches the exact command', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerZoomInButton, { style: { borderRadius: 3, height: 1 } }));
    });
    const button = renderer.root.findByProps({ accessibilityLabel: 'zoomIn' });
    expect(button.props.style({ pressed: false })).toMatchObject({ height: 44, width: 44 });
    const paint = button.findAllByType('View' as any)[0]!;
    expect(paint.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ borderRadius: 3 }),
      expect.objectContaining({ height: 40, width: 40 }),
    ]));
    await act(async () => { button.props.onPress(); });
    expect(runtime.commands.zoomIn).toHaveBeenCalledOnce();
  });

  it('drives segmented Map/3D and exposes only capability-backed immersive controls', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerViewModeControl)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'interactive3dVenueView' }).props.onPress(); });
    expect(runtime.commands.setBuyerView).toHaveBeenCalledWith('venue3d');

    runtime.update({ map: { buyerView: 'venue3d', view3DNavigationMode: 'orbit' } });
    await act(async () => { renderer.update(React.createElement(SeatLayerPicker3DNavigationModeButton)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'rotateVenue' }).props.onPress(); });
    expect(runtime.commands.setVenue3DNavigationMode).toHaveBeenCalledWith('pan');

    runtime.update({ capabilities: [], map: { buyerView: 'map' } });
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerColorblindButton)); });
    expect(renderer.toJSON()).not.toBeNull();
  });

  it('exposes selected semantics only on true standalone toggles', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerZoomInButton)); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'zoomIn' }).props.accessibilityState)
      .toEqual({ disabled: false });

    await act(async () => { renderer.update(React.createElement(SeatLayerPickerColorblindButton)); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'colorblindSafe' }).props.accessibilityState)
      .toEqual({ disabled: false, selected: false });

    runtime.update({ map: { colorblindSafe: true } });
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerColorblindButton)); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'colorblindSafe' }).props.accessibilityState)
      .toEqual({ disabled: false, selected: true });
  });

  it('uses negotiated seat inspection commands while allowing an explicit host action', async () => {
    const runtime = setup(); const seat = { id: 'seat-a', label: 'A-1' }; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatViewButton, { seat })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress(); });
    expect(runtime.commands.openSeatView).toHaveBeenCalledWith('seat-a');

    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSeat3DButton, { seat })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'See it in 3D' }).props.onPress(); });
    expect(runtime.commands.setBuyerView).toHaveBeenCalledWith('venue3d', { flyToSeatId: 'seat-a' });

    const host = vi.fn();
    runtime.update({ capabilities: [] });
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSeatViewButton, { seat, onPress: host })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress(); });
    expect(host).toHaveBeenCalledWith(seat);
  });

  it('makes retained presses inert after a scope or exact seat replacement', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerZoomInButton)); });
    const retiredZoom = renderer.root.findByProps({ accessibilityLabel: 'zoomIn' }).props.onPress;
    runtime.replaceSession();
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerZoomInButton)); });
    await act(async () => { retiredZoom(); });
    expect(runtime.commands.zoomIn).not.toHaveBeenCalled();

    const firstSeat = { id: 'seat-a', label: 'A-1' };
    const secondSeat = { id: 'seat-b', label: 'B-1' };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSeatViewButton, { seat: firstSeat })); });
    const retiredSeat = renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress;
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSeatViewButton, { seat: secondSeat })); });
    await act(async () => { retiredSeat(); });
    expect(runtime.commands.openSeatView).not.toHaveBeenCalled();
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress(); });
    expect(runtime.commands.openSeatView).toHaveBeenCalledWith('seat-b');
  });
});
