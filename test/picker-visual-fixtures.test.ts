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
import { SeatLayerCartSheet } from '../src/picker/SeatLayerCartSheet';
import { SeatLayerBestSeatsForm } from '../src/picker/SeatLayerBestSeatsForm';
import { SeatLayerConfirmCard } from '../src/picker/SeatLayerConfirmCard';
import { SeatLayerSeatPanoramaChrome } from '../src/picker/SeatLayerSeatPanoramaChrome';
import { SeatLayerVenue3DChrome } from '../src/picker/SeatLayerVenue3DChrome';
import { SeatLayerPickerAccessibilityFilters } from '../src/picker/accessibility';
import { SeatLayerPickerGAPrompt, SeatLayerPickerTablePrompt } from '../src/picker/SeatLayerPickerDecisionPrompts';
import { SeatLayerPickerHeader } from '../src/picker/header';
import { NeutralMapSurface } from '../example/visual-fixtures/NeutralMapSurface';
import {
  SeatLayerPickerDarkVisualFixture,
  SeatLayerPickerLightVisualFixture,
  SeatLayerPickerVisualFixture,
  parseSeatLayerVisualFixture,
  seatLayerVisualFixtureHeight,
  seatLayerVisualFixtureSafeAreaInsets,
  seatLayerVisualFixtureScenarios,
  seatLayerVisualFixtureWideHeight,
  seatLayerVisualFixtureWideWidth,
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
    const frame = tree.root.findByProps({ testID: 'seatlayer-visual-fixture-light-cart-expanded' });
    expect(frame.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: seatLayerVisualFixtureWidth, height: seatLayerVisualFixtureHeight }),
    ]));
    const adaptive = tree.root.findByType(SeatLayerPickerAdaptiveLayout);
    expect(adaptive.props.safeAreaInsets).toBe(seatLayerVisualFixtureSafeAreaInsets);
    expect(tree.root.findAllByType(SeatLayerPickerHeader)).toHaveLength(1);
    expect(tree.root.findByType(SeatLayerCartSheet).props.expanded).toBe(true);
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
    expect(light.root.findByProps({ testID: 'seatlayer-visual-fixture-light-cart-expanded' }).props.style[1].backgroundColor)
      .not.toBe(dark.root.findByProps({ testID: 'seatlayer-visual-fixture-dark-cart-expanded' }).props.style[1].backgroundColor);
    expect(dark.root.findAllByProps({ testID: 'seatlayer-visual-fixture-map' })).toHaveLength(1);
    expect(light.root.findByType('StatusBar' as never).props.barStyle).toBe('dark-content');
    expect(dark.root.findByType('StatusBar' as never).props.barStyle).toBe('light-content');
  });

  it('parses named light/dark captures while retaining the original aliases', () => {
    expect(parseSeatLayerVisualFixture('light')).toEqual({ mode: 'light', scenario: 'cart-expanded' });
    expect(parseSeatLayerVisualFixture('dark:confirmation')).toEqual({ mode: 'dark', scenario: 'confirmation' });
    expect(parseSeatLayerVisualFixture('light:not-a-state')).toBeUndefined();
    expect(parseSeatLayerVisualFixture(undefined)).toBeUndefined();
  });

  it('renders every named scenario through the same production composition', async () => {
    for (const scenario of seatLayerVisualFixtureScenarios) {
      const tree = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'light', scenario }));
      expect(tree.root.findAllByProps({ testID: `seatlayer-visual-fixture-light-${scenario}` })).toHaveLength(1);
      expect(tree.root.findAllByType(SeatLayerPickerAdaptiveLayout)).toHaveLength(1);
      expect(tree.root.findAllByType(NeutralMapSurface)).toHaveLength(1);
      tree.unmount();
    }
  });

  it('exposes the production widget that owns each specialist fixture state', async () => {
    const confirmation = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'light', scenario: 'confirmation' }));
    expect(confirmation.root.findAllByType(SeatLayerConfirmCard)).toHaveLength(1);

    const bestSeats = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'light', scenario: 'best-seats' }));
    expect(bestSeats.root.findAllByType(SeatLayerBestSeatsForm).length).toBeGreaterThan(0);

    const venue = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'dark', scenario: 'venue-3d' }));
    expect(venue.root.findAllByType(SeatLayerVenue3DChrome)).toHaveLength(1);
    expect(venue.root.findByType(NeutralMapSurface).props.immersive).toBe(true);

    const panorama = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'dark', scenario: 'seat-view' }));
    expect(panorama.root.findAllByType(SeatLayerSeatPanoramaChrome)).toHaveLength(1);
    expect(panorama.root.findByType(NeutralMapSurface).props.immersive).toBe(true);

    const accessibility = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'light', scenario: 'accessibility' }));
    expect(accessibility.root.findAllByType(SeatLayerPickerAccessibilityFilters)).toHaveLength(1);

    const ga = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'light', scenario: 'general-admission' }));
    expect(ga.root.findAllByType(SeatLayerPickerGAPrompt)).toHaveLength(1);
    expect(ga.root.findAllByProps({ accessibilityRole: 'radiogroup' })).toHaveLength(1);

    const table = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'light', scenario: 'variable-table' }));
    expect(table.root.findAllByType(SeatLayerPickerTablePrompt)).toHaveLength(1);
    expect(table.root.findAllByProps({ accessibilityRole: 'adjustable' })).toHaveLength(1);

    const wide = await render(React.createElement(SeatLayerPickerVisualFixture, { mode: 'light', scenario: 'wide' }));
    expect(wide.root.findByProps({ testID: 'seatlayer-visual-fixture-light-wide' }).props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: seatLayerVisualFixtureWideWidth, height: seatLayerVisualFixtureWideHeight }),
    ]));
    expect(wide.root.findByType(SeatLayerPickerAdaptiveLayout).props.options.layout).toBe('wide');
  });
});
