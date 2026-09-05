import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
}));

import {
  ConfidenceTeaser,
  seatLayerPickerConfidenceDetail,
  seatLayerPickerConfidenceTeaserGround,
} from '../src/picker/confidenceTeaser';
import { seatLayerPickerContrastRatio } from '../src/picker/confirmCardIdentity';
import type { SeatLayerPickerSeatConfidence } from '../src/picker/models';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const theme = {
  accent: '#5B4B8A', surface: '#F6F7FB', divider: '#17203329', text: '#172033', mutedText: '#667085', fontFamily: 'Brand',
};

const confidence = (overrides: Partial<SeatLayerPickerSeatConfidence> = {}): SeatLayerPickerSeatConfidence => ({
  headline: 'Real photo from this seat',
  model: 'Exact seat', reality: 'Photographed on 12 May', coverage: 'Exact seat', provenance: 'Organizer',
  freshness: 'Assessed 2026-08-01', limitations: [], ...overrides,
});

function render(element: React.ReactElement): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = create(element); });
  return tree!;
}

const teaser = (props: Partial<Parameters<typeof ConfidenceTeaser>[0]> = {}) =>
  render(React.createElement(ConfidenceTeaser, {
    confidence: confidence(), theme, passportLabel: 'Passport', ...props,
  }));

describe('§3.8.7 the confidence teaser', () => {
  it('prints the headline over the detail with the passport word trailing', () => {
    const texts = teaser().root.findAllByType('Text' as never).map((node) => node.props.children);
    expect(texts).toEqual(['Real photo from this seat', 'Photographed on 12 May', 'Passport']);
  });

  it('prefers the modelled target over the reality for the detail line', () => {
    expect(seatLayerPickerConfidenceDetail(confidence({ modeledTarget: 'Modelled from row N' })))
      .toBe('Modelled from row N');
    expect(seatLayerPickerConfidenceDetail(confidence({ modeledTarget: '   ' })))
      .toBe('Photographed on 12 May');
  });

  it('keeps every line to one, ellipsised', () => {
    for (const node of teaser().root.findAllByType('Text' as never)) {
      expect(node.props.numberOfLines).toBe(1);
    }
  });

  it('is drawn to its own tokens', () => {
    const row = teaser().root.findAllByType('View' as never)[1]!;
    const style = row.props.style.flat ? row.props.style.flat() : row.props.style;
    const merged = Object.assign({}, ...[style].flat(2));
    expect(merged.minHeight).toBe(seatLayerPickerTokens.size.confidenceTeaserMinHeight);
    expect(merged.marginTop).toBe(seatLayerPickerTokens.size.confidenceTeaserTop);
    expect(merged.paddingHorizontal).toBe(seatLayerPickerTokens.size.confidenceTeaserPadX);
    expect(merged.paddingVertical).toBe(seatLayerPickerTokens.size.confidenceTeaserPadY);
    expect(merged.borderRadius).toBe(seatLayerPickerTokens.size.confidenceTeaserRadius);
  });

  it('grounds itself in the accent at 7 % over the surface', () => {
    expect(seatLayerPickerConfidenceTeaserGround('#000000', '#FFFFFF')).toBe('rgb(237, 237, 237)');
  });

  it('prints the passport word in an accent that clears 4.5:1 on both grounds', () => {
    const dark = { accent: '#9B8AFB', surface: '#1A2234', divider: '#A5AEC23D', text: '#EEF1F8', mutedText: '#A5AEC2' };
    const badge = teaser({ theme: dark }).root.findAllByType('Text' as never)[2]!;
    const ground = seatLayerPickerConfidenceTeaserGround(dark.accent, dark.surface);
    const merged = Object.assign({}, ...[badge.props.style].flat(2));
    expect(seatLayerPickerContrastRatio(merged.color, dark.surface)).toBeGreaterThanOrEqual(4.5);
    expect(seatLayerPickerContrastRatio(merged.color, ground)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('§3.8.7 it is a button only where the host can act on it', () => {
  it('is a static row with no focus stop when nothing can be opened', () => {
    const tree = teaser();
    expect(tree.root.findAllByType('Pressable' as never)).toHaveLength(0);
    const root = tree.root.findByProps({ testID: 'seatLayerConfidenceTeaser' });
    expect(root.props.accessible).toBe(false);
    expect(root.props.importantForAccessibility).toBe('no');
  });

  it('becomes a button named for what it opens where a host takes the callback', () => {
    const opened: number[] = [];
    const tree = teaser({ onOpen: () => opened.push(1) });
    const button = tree.root.findByProps({ testID: 'seatLayerConfidenceTeaser' });
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Passport');
    act(() => { button.props.onPress(); });
    expect(opened).toEqual([1]);
  });

  it('draws nothing at all where the runtime resolved no headline', () => {
    expect(teaser({ confidence: confidence({ headline: '  ' }) }).toJSON()).toBeNull();
  });
});
