import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false },
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));

import {
  SeatLayerPriceLegend,
  seatLayerPickerLegendChipText,
  seatLayerPickerLegendSoldOut,
} from '../src/picker/SeatLayerPriceLegend';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const money = (amount: number) => `$${amount}`;

const categories = [
  { key: 'a', label: 'Stalls', color: '#c00', priceMin: 40, priceMax: 40, free: 12 },
  { key: 'b', label: 'Circle', color: '#0c0', priceMin: 25, priceMax: 80, free: 3 },
  { key: 'c', label: 'Boxes', color: '#00c', priceMin: 0, priceMax: 0 },
  { key: 'd', label: 'Gods', color: '#cc0', priceMin: 15, priceMax: 15, free: 0 },
];

function setup(themeMode: 'light' | 'dark' = 'light', filter: readonly string[] = []) {
  const setCategoryFilter = vi.fn(async () => undefined);
  const snapshot: any = {
    currency: 'USD',
    categories: categories.map((category) => ({ ...category, notForSale: false, available: 0 })),
    map: { categoryFilter: filter },
  };
  scope = {
    controller: {
      setCategoryFilter,
      getSnapshot: () => snapshot,
      mapController: {
        isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true,
      },
    },
    snapshot, sessionId: 1, isBusy: false, reportError: vi.fn(), styles: {},
    strings: { translate: (key: string) => key },
    pricing: { formatter: (amount: number) => money(amount) },
    resolvedTheme: {
      themeMode,
      colors: {
        accent: '#5B4B8A', background: '#FFFFFF', divider: '#ccc', mapBackground: '#E9EDF4',
        mutedText: '#667085', onAccent: '#fff', surface: '#F6F7FB', text: '#172033',
      },
      fontFamily: 'Brand',
      layout: {
        legendChipDotSize: seatLayerPickerTokens.size.legendChipDotSize,
        legendChipFontSize: seatLayerPickerTokens.size.legendChipFontSize,
        legendChipHeight: seatLayerPickerTokens.size.legendChipHeight,
        minimumHitTarget: seatLayerPickerTokens.size.minimumHitTarget,
        topRailHeight: seatLayerPickerTokens.size.topRailHeight,
      },
      radii: { chip: seatLayerPickerTokens.radius.chip },
    },
  };
  return { setCategoryFilter };
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(SeatLayerPriceLegend, {})); });
  return renderer;
}

describe('3.2 amount rule', () => {
  it('prints a single price as itself and an equal min/max once', () => {
    expect(seatLayerPickerLegendChipText({ label: 'Stalls', priceMin: 40 }, money)).toBe('$40');
    expect(seatLayerPickerLegendChipText({ label: 'Stalls', priceMin: 40, priceMax: 40 }, money))
      .toBe('$40');
  });

  it('prints {min}+ for a range', () => {
    expect(seatLayerPickerLegendChipText({ label: 'Circle', priceMin: 25, priceMax: 80 }, money))
      .toBe('$25+');
  });

  it('shows the category NAME where no price is configured', () => {
    expect(seatLayerPickerLegendChipText({ label: 'Boxes', priceMin: 0, priceMax: 0 }, money))
      .toBe('Boxes');
  });
});

describe('3.2 sold out is only what the runtime can be trusted about', () => {
  it('treats an absent figure as unknown, never as zero', () => {
    expect(seatLayerPickerLegendSoldOut({})).toBe(false);
    expect(seatLayerPickerLegendSoldOut({ free: undefined })).toBe(false);
    expect(seatLayerPickerLegendSoldOut({ free: 3 })).toBe(false);
    expect(seatLayerPickerLegendSoldOut({ free: 0 })).toBe(true);
  });

  it('keeps the sold-out chip, disabled and struck through', async () => {
    setup();
    const renderer = await render();
    const chip = renderer.root.findByProps({ accessibilityLabel: 'Gods, $15' });
    expect(chip.props.accessibilityState.disabled).toBe(true);
    const label = chip.findByType('Text' as never);
    expect(label.props.style).toContainEqual(
      expect.objectContaining({ textDecorationLine: 'line-through' }),
    );
    const live = renderer.root.findByProps({ accessibilityLabel: 'Circle, $25+' });
    expect(live.findByType('Text' as never).props.style)
      .not.toContainEqual(expect.objectContaining({ textDecorationLine: 'line-through' }));
  });
});

describe('3.2 All prices', () => {
  it('is the first chip, pinned, and selected while no filter narrows the map', async () => {
    setup();
    const renderer = await render();
    const all = renderer.root.findByProps({ accessibilityLabel: 'allPrices' });
    expect(all.props.accessibilityState.selected).toBe(true);
    // Pinned: it lives outside the scroller, so it never scrolls away.
    expect(renderer.root.findByType('ScrollView' as never)
      .findAllByProps({ accessibilityLabel: 'allPrices' })).toHaveLength(0);
  });

  it('clears the filter and frames the whole venue', async () => {
    const runtime = setup('light', ['b']);
    const renderer = await render();
    const all = renderer.root.findByProps({ accessibilityLabel: 'allPrices' });
    expect(all.props.accessibilityState.selected).toBe(false);
    await act(async () => { all.props.onPress(); });
    expect(runtime.setCategoryFilter).toHaveBeenCalledWith([], true);
  });

  it('frames the whole venue when the lit chip is pressed again', async () => {
    const runtime = setup('light', ['b']);
    const renderer = await render();
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Circle, $25+' }).props.onPress();
    });
    expect(runtime.setCategoryFilter).toHaveBeenCalledWith([], true);
  });

  it('drills in, framed, on the first press of a band', async () => {
    const runtime = setup();
    const renderer = await render();
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Stalls, $40' }).props.onPress();
    });
    expect(runtime.setCategoryFilter).toHaveBeenCalledWith(['a'], true);
  });
});

function dotOf(renderer: ReactTestRenderer, label: string): Record<string, any> {
  const chip = renderer.root.findByProps({ accessibilityLabel: label });
  const dot = chip.findAllByType('View' as never)
    .map((node) => node.props.style as Record<string, any>)
    .find((style) => style?.height === seatLayerPickerTokens.size.legendChipDotSize);
  expect(dot).toBeDefined();
  return dot!;
}

describe('3.2 the band and its chips', () => {
  it('is a band of its own, on the surface with a hairline beneath', async () => {
    setup();
    const renderer = await render();
    const band = renderer.root.findAllByType('View' as never)[0]!;
    expect(band.props.style[0]).toMatchObject({
      backgroundColor: '#F6F7FB',
      borderBottomColor: '#ccc',
      borderBottomWidth: 1,
      height: seatLayerPickerTokens.size.topRailHeight,
    });
    // The rail is a band, not a bleed: its chips sit inside its own margin, so
    // the pinned chip's rounded end is never cut off by the screen edge.
    const inner = renderer.root.findAllByType('View' as never)[1]!;
    expect(inner.props.style).toMatchObject({ paddingHorizontal: 10 });
  });

  it('rings the dot on light and keeps it flat on dark', async () => {
    setup('light');
    const light = await render();
    const lightDot = dotOf(light, 'Stalls, $40');
    expect(lightDot).toMatchObject({
      borderColor: 'rgba(204, 0, 0, 1)',
      borderWidth: 1.5,
      height: seatLayerPickerTokens.size.legendChipDotSize,
    });
    expect(lightDot.backgroundColor).not.toBe('rgba(204, 0, 0, 1)');

    setup('dark');
    const dark = await render();
    expect(dotOf(dark, 'Stalls, $40'))
      .toMatchObject({ backgroundColor: 'rgba(204, 0, 0, 1)', borderWidth: 0 });
  });

  it('keeps the colour key when a chip inverts', async () => {
    setup('dark', ['a']);
    const renderer = await render();
    expect(dotOf(renderer, 'Stalls, $40'))
      .toMatchObject({ backgroundColor: 'rgba(204, 0, 0, 1)', borderColor: '#fff', borderWidth: 1.5 });
  });
});
