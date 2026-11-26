import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
}));

import {
  SeatLayerPickerViewModeControlView,
  seatLayerPickerViewModeLabelScaleClamp,
} from '../src/picker/mapViewModeControl';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const half = seatLayerPickerTokens.size.viewModeButtonHeight;

function render(labelSize: number): ReactTestRenderer {
  const theme = {
    colors: { accent: '#7c3aed', onAccent: '#ffffff', mutedText: '#64748b', surface: '#ffffff', border: '#e2e8f0', text: '#0f172a', background: '#ffffff' },
    fontFamily: undefined,
    layout: { viewModeButtonMinWidth: 38, viewModeLabelFontSize: labelSize },
  } as never;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(React.createElement(SeatLayerPickerViewModeControlView, {
      buyerView: 'map', disabled: false, theme, slots: undefined,
      strings: { translate: (key: string) => key } as never, target: 44, onPress: () => undefined,
    } as never));
  });
  return renderer;
}

function labels(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => (node.type as unknown) === 'Text');
}

describe('the Map and 3D words at a large text size', () => {
  it('stop growing when their line is as tall as the lit half', () => {
    const size = seatLayerPickerTokens.size.viewModeLabelFontSize;
    const found = labels(render(size));
    expect(found).toHaveLength(2);
    for (const label of found) {
      const limit = label.props.maxFontSizeMultiplier as number;
      expect(limit).toBe(seatLayerPickerViewModeLabelScaleClamp(size));
      expect(size * limit * 1.2).toBeCloseTo(half, 6);
    }
  });

  it('still grow to twice their size, as the other map words do', () => {
    expect(seatLayerPickerViewModeLabelScaleClamp(seatLayerPickerTokens.size.viewModeLabelFontSize))
      .toBeGreaterThan(2);
  });

  it('follow a theme that sets its own label size', () => {
    const [label] = labels(render(12));
    expect(label!.props.maxFontSizeMultiplier).toBeCloseTo(half / (12 * 1.2), 6);
  });

  it('never ask for a limit below 1, which would mean no limit at all', () => {
    expect(seatLayerPickerViewModeLabelScaleClamp(40)).toBe(1);
    expect(seatLayerPickerViewModeLabelScaleClamp(0)).toBe(1);
    expect(seatLayerPickerViewModeLabelScaleClamp(Number.NaN)).toBe(1);
  });
});
