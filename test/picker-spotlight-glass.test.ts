import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  AccessibilityInfo: { addEventListener: () => ({ remove: () => undefined }) },
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1, absoluteFill: { position: 'absolute' } },
  View: 'View',
}));

import {
  SpotlightGlass,
  seatLayerPickerSpotlightBlur,
  seatLayerPickerSpotlightLayers,
  seatLayerPickerSpotlightVeil,
  setSeatLayerPickerSpotlightBlur,
} from '../src/picker/SpotlightGlass';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

function render(element: React.ReactElement): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = create(element); });
  return tree!;
}

describe('§3.8.1 the veil', () => {
  it('is the confirmScrim token, and the flat one under reduced transparency', () => {
    expect(seatLayerPickerSpotlightVeil(false)).toBe(seatLayerPickerTokens.opacity.confirmScrim);
    expect(seatLayerPickerSpotlightVeil(true)).toBe(seatLayerPickerTokens.opacity.confirmScrimFlat);
    expect(seatLayerPickerTokens.opacity.confirmScrimFlat).toBeGreaterThan(seatLayerPickerTokens.opacity.confirmScrim);
  });

  it('draws nothing at all where there is no seat to spotlight', () => {
    expect(render(React.createElement(SpotlightGlass, { visible: false, screenPoint: { x: 10, y: 10 } })).toJSON()).toBeNull();
  });
});

describe('§3.8.2 the hole', () => {
  const veil = seatLayerPickerTokens.opacity.confirmScrim;
  const layers = seatLayerPickerSpotlightLayers({ x: 200, y: 300 }, veil);

  it('is clear at 56 px and at full strength by 88 px', () => {
    expect(seatLayerPickerTokens.size.confirmScrimClearRadius).toBe(56);
    expect(seatLayerPickerTokens.size.confirmScrimFeatherRadius).toBe(88);
    const rings = layers.filter((layer) => layer.ring !== undefined && layer.key !== 'ring-corner');
    expect(rings).toHaveLength(8);
    const innermost = rings[0]!;
    const outermost = rings[rings.length - 1]!;
    expect(innermost.ring!.radius - innermost.ring!.border).toBe(56);
    expect(outermost.ring!.radius).toBe(88);
    expect(innermost.opacity).toBeLessThan(outermost.opacity);
    expect(outermost.opacity).toBeLessThan(veil);
    expect(innermost.opacity).toBeGreaterThan(0);
  });

  it('veils the corners the rectangles leave, out to the square’s own corner', () => {
    const corner = layers.find((layer) => layer.key === 'ring-corner');
    expect(corner?.opacity).toBe(veil);
    // The square the four rectangles leave is 88 px half-side; its corner sits
    // at 88·√2, which is where this ring's outer edge is.
    expect(corner?.ring?.radius).toBeCloseTo(88 * Math.SQRT2, 6);
    expect(corner!.ring!.radius - corner!.ring!.border).toBeCloseTo(88, 6);
  });

  it('centres the feather on the seat’s own screen point', () => {
    const rings = layers.filter((layer) => layer.ring !== undefined);
    for (const ring of rings) {
      expect(ring.ring!.left + ring.ring!.radius).toBe(200);
      expect(ring.ring!.top + ring.ring!.radius).toBe(300);
    }
  });

  it('veils everything outside the feather at full strength', () => {
    const rects = layers.filter((layer) => layer.rect !== undefined);
    expect(rects.map((layer) => layer.key)).toEqual(['above', 'below', 'leading', 'trailing']);
    for (const rect of rects) expect(rect.opacity).toBe(veil);
    expect(rects[0]?.rect).toMatchObject({ height: 300 - 88 });
    expect(rects[1]?.rect).toMatchObject({ top: 300 + 88 });
  });

  it('falls back to one flat wash where the runtime reports no screen point', () => {
    const flat = seatLayerPickerSpotlightLayers(undefined, veil);
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ key: 'flat', opacity: veil });
    expect(seatLayerPickerSpotlightLayers({ x: Number.NaN, y: 4 }, veil)[0]?.key).toBe('flat');
  });
});

describe('§3.8.1 the glass never takes a pointer event', () => {
  it('passes every press through to the map beneath it', () => {
    const tree = render(React.createElement(SpotlightGlass, { visible: true, screenPoint: { x: 100, y: 100 } }));
    const root = tree.root.findByProps({ testID: 'seatLayerSpotlightGlass' });
    expect(root.props.pointerEvents).toBe('none');
    expect(root.props.accessibilityElementsHidden).toBe(true);
    for (const child of tree.root.findAllByType('View' as never)) {
      expect(child.props.pointerEvents).toBe('none');
    }
  });
});

describe('the blur is optional and never a hard dependency', () => {
  it('draws the plain veil with nothing installed, and the blur with one', () => {
    expect(seatLayerPickerSpotlightBlur()).toBeUndefined();
    const plain = render(React.createElement(SpotlightGlass, { visible: true, screenPoint: { x: 10, y: 10 } }));
    expect(plain.root.findAllByType('Blur' as never)).toHaveLength(0);
    const Blur = (props: { blurAmount: number }) => React.createElement('Blur', props);
    setSeatLayerPickerSpotlightBlur(Blur);
    try {
      const blurred = render(React.createElement(SpotlightGlass, { visible: true, screenPoint: { x: 10, y: 10 } }));
      const found = blurred.root.findAllByType('Blur' as never);
      expect(found).toHaveLength(1);
      expect(found[0]?.props.blurAmount).toBe(seatLayerPickerTokens.size.confirmScrimBlur);
      // Reduced transparency drops the blur and deepens the veil instead.
      const legible = render(React.createElement(SpotlightGlass, { visible: true, reducedTransparency: true, screenPoint: { x: 10, y: 10 } }));
      expect(legible.root.findAllByType('Blur' as never)).toHaveLength(0);
    } finally {
      setSeatLayerPickerSpotlightBlur(undefined);
    }
  });
});
