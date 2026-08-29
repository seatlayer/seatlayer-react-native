import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Image: 'Image', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', StatusBar: 'StatusBar', Text: 'Text', View: 'View',
  Animated: {
    View: 'AnimatedView',
    Value: class { constructor(readonly value: number) {} interpolate() { return this.value; } setValue() {} stopAnimation() {} },
    timing: () => ({ start: (done?: () => void) => done?.(), stop: () => undefined }),
  },
  I18nManager: { isRTL: false },
  Easing: { bezier: () => undefined },
  BackHandler: { addEventListener: () => ({ remove: () => undefined }) },
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(true), addEventListener: () => ({ remove: () => undefined }) },
  StyleSheet: { create: <Value,>(value: Value) => value, hairlineWidth: 1, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, flatten: (value: unknown) => value },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

// Adaptive imports its default chart eagerly even when this fixture replaces
// that part. Keep the transport implementation out of the node renderer.
vi.mock('../src/SeatLayerRenderer', () => ({ SeatLayerRenderer: 'runtime-map' }));

import { SeatLayerPickerAdaptiveLayout } from '../src/picker/SeatLayerPickerAdaptiveLayout';
import { SeatLayerPickerHeader } from '../src/picker/header';
import { NeutralMapSurface } from '../example/visual-fixtures/NeutralMapSurface';
import {
  SeatLayerPickerDarkVisualFixture,
  SeatLayerPickerLightVisualFixture,
  seatLayerVisualFixtureHeight,
  seatLayerVisualFixtureSafeAreaInsets,
  seatLayerVisualFixtureWidth,
} from '../example/visual-fixtures/PickerVisualFixture';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(element: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(element); });
  return tree;
}

describe('deterministic native picker visual fixtures', () => {
  it('renders the light fixture through actual adaptive and standalone components at 390×844', async () => {
    const tree = await render(React.createElement(SeatLayerPickerLightVisualFixture));
    const frame = tree.root.findByProps({ testID: 'seatlayer-visual-fixture-light' });
    expect(frame.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: seatLayerVisualFixtureWidth, height: seatLayerVisualFixtureHeight }),
    ]));
    const adaptive = tree.root.findByType(SeatLayerPickerAdaptiveLayout);
    expect(adaptive.props.safeAreaInsets).toBe(seatLayerVisualFixtureSafeAreaInsets);
    expect(tree.root.findAllByType(SeatLayerPickerHeader)).toHaveLength(1);
    expect(tree.root.findAllByType(NeutralMapSurface)).toHaveLength(1);
    expect(tree.root.findAllByProps({ testID: 'seatlayer-visual-fixture-map' })).toHaveLength(1);

    const mapSegment = tree.root.findByProps({ accessibilityLabel: 'Seat map' });
    expect(mapSegment.props.style({ pressed: false })).toMatchObject({
      height: 44,
      minWidth: 46,
      paddingHorizontal: 10,
    });
    expect(mapSegment.props.style({ pressed: false })).not.toHaveProperty('width');
    expect(mapSegment.props.style({ pressed: false })).not.toHaveProperty('maxWidth');
    expect(mapSegment.findAllByType('View' as never)).toEqual(expect.arrayContaining([
      expect.objectContaining({ props: expect.objectContaining({ style: expect.arrayContaining([
        expect.objectContaining({ left: 0, position: 'absolute', right: 0 }),
      ]) }) }),
    ]));
  });

  it('uses the same native composition for dark mode and changes only the frozen fixture theme', async () => {
    const light = await render(React.createElement(SeatLayerPickerLightVisualFixture));
    const dark = await render(React.createElement(SeatLayerPickerDarkVisualFixture));
    expect(light.root.findAllByType(SeatLayerPickerAdaptiveLayout)).toHaveLength(1);
    expect(dark.root.findAllByType(SeatLayerPickerAdaptiveLayout)).toHaveLength(1);
    expect(light.root.findByProps({ testID: 'seatlayer-visual-fixture-light' }).props.style[1].backgroundColor)
      .not.toBe(dark.root.findByProps({ testID: 'seatlayer-visual-fixture-dark' }).props.style[1].backgroundColor);
    expect(dark.root.findAllByProps({ testID: 'seatlayer-visual-fixture-map' })).toHaveLength(1);
  });
});
