import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => {
  const Animated = {
    View: 'Animated.View',
    Value: class {
      constructor(private readonly value: number) {}
      interpolate() { return 0; }
      stopAnimation() {}
      setValue() {}
    },
  };
  return {
    Animated,
    I18nManager: { isRTL: false },
    Pressable: 'Pressable', Text: 'Text', View: 'View',
    StyleSheet: { create: <T>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
  };
});
vi.mock('../src/picker/blockedRegionsContext', () => ({
  useSeatLayerPickerBlockedRegion: () => ({ onLayout: () => {}, ref: { current: null } }),
  SeatLayerPickerBlockedRegion: 'BlockedRegion',
}));

import { SeatLayerCartPeekHead } from '../src/picker/cartPeekHead';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const theme = {
  colors: {
    accent: '#e54558', onAccent: '#fff', surface: '#F6F7FB', background: '#fff',
    text: '#172033', mutedText: '#667085', divider: '#ccc',
  },
  fontFamily: undefined,
  layout: { minimumHitTarget: 44 },
  radii: seatLayerPickerTokens.radius,
} as never;

function head(expanded: boolean): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(SeatLayerCartPeekHead, {
      expanded,
      height: 66,
      line: { sentence: 'From €42', summary: 'From €42', fromAmount: '€42' },
      onToggle: () => {},
      summarySwell: { interpolate: () => 1 },
      theme,
      toggleLabel: 'expandCart',
    } as never));
  });
  return renderer;
}

function summaryTexts(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAllByType('Text' as never);
}

describe('§3.9 peek head summary', () => {
  it('lifts the amount out of the line only while collapsed', () => {
    const collapsed = summaryTexts(head(false));
    const lifted = collapsed.find((node) => {
      const style = node.props.style;
      const parts = Array.isArray(style) ? style : [style];
      return parts.some((part: Record<string, unknown> | undefined) =>
        part?.fontSize === seatLayerPickerTokens.type.peekFromPrice.size);
    });
    expect(lifted).toBeTruthy();
    // The words around the lifted money step back to caption strength.
    const outerCollapsed = collapsed[0]!.props.style[0] as Record<string, unknown>;
    expect(outerCollapsed.color).toBe('#667085');
    expect(outerCollapsed.fontSize).toBe(seatLayerPickerTokens.type.peekSummary.size);

    const open = summaryTexts(head(true));
    expect(open.some((node) => {
      const style = node.props.style;
      const parts = Array.isArray(style) ? style : [style];
      return parts.some((part: Record<string, unknown> | undefined) =>
        part?.fontSize === seatLayerPickerTokens.type.peekFromPrice.size);
    })).toBe(false);
    const outerOpen = open[0]!.props.style[0] as Record<string, unknown>;
    // One weight throughout, in the reading ink, at the open head's size.
    expect(outerOpen.color).toBe('#172033');
    expect(outerOpen.fontSize).toBe(seatLayerPickerTokens.type.peekSummaryOpen.size);
    expect(JSON.stringify(head(true).toJSON())).toContain('From €42');
  });
});
