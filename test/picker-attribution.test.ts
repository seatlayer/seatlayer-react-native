import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: { create: <T>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
  View: 'View', Text: 'Text',
}));

import { SeatLayerPickerAttributionView } from '../src/picker/attribution';
import { seatLayerPickerFontWeight } from '../src/picker/fontWeight';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

function render(props: Record<string, unknown>): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(SeatLayerPickerAttributionView, props as never),
    );
  });
  return renderer;
}

function flatten(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...parts.filter((part) => part && typeof part === 'object'));
}

describe('§3.10.3 attribution', () => {
  it('draws the mark at its one size and the line at the generated type', () => {
    const renderer = render({ required: true, label: 'Powered by SeatLayer', textColor: '#111111' });
    const views = renderer.root.findAllByType('View' as never);
    const root = flatten(views[0]!.props.style);
    // The credit is centred, at the reference's own opacity and gap.
    expect(root.alignItems).toBe('center');
    expect(root.justifyContent).toBe('center');
    expect(root.opacity).toBe(0.72);
    expect(root.gap).toBe(5);

    // Sixteen points square on every surface, in the mark's own two colours.
    const mark = flatten(views[1]!.props.style);
    expect(mark.width).toBe(16);
    expect(mark.height).toBe(16);
    expect(mark.borderRadius).toBe(4);
    expect(mark.backgroundColor).toBe('#0C1220');

    const bars = views.slice(2, 5).map((view) => flatten(view.props.style));
    expect(bars.map((bar) => bar.width)).toEqual([10, 7, 4]);
    for (const bar of bars) {
      expect(bar.height).toBe(2);
      expect(bar.backgroundColor).toBe('#FCF7EE');
    }

    const text = flatten(renderer.root.findByType('Text' as never).props.style);
    expect(text.fontSize).toBe(seatLayerPickerTokens.type.attribution.size);
    expect(text.fontWeight)
      .toBe(seatLayerPickerFontWeight(seatLayerPickerTokens.type.attribution.weight));
    expect(text.color).toBe('#111111');
  });

  it('is silent unless the entitlement asks for it', () => {
    expect(render({ required: false, label: 'Powered by SeatLayer', textColor: '#111111' }).toJSON())
      .toBeNull();
  });
});
