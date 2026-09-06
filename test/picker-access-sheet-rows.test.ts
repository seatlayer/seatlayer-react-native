import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  useSeatLayerPickerScope: () => scope,
  SeatLayerPickerScopeReprovider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('ScopeReprovider', undefined, children),
}));

import { SeatLayerPickerAccessibilityFilters } from '../src/picker/accessibility';
import {
  seatLayerPickerAccessSheetMaxHeight,
  seatLayerPickerAccessRowGlyphIsPlaceholder,
} from '../src/picker/accessibilitySheet';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const english = seatLayerPickerTokens.strings;
const size = seatLayerPickerTokens.size;

function setup(options: {
  needs?: readonly { key: string; count?: number }[];
  active?: readonly string[];
  view?: boolean;
  tour?: boolean;
} = {}) {
  const calls: unknown[] = [];
  const snapshot: any = {
    sessionId: 'runtime',
    capabilities: [
      'accessibilityFilter', 'section-access-counts-v1',
      ...(options.view === false ? [] : ['limitedViewFilter']),
    ],
    sections: [],
    map: {
      rung: 'seats',
      accessibilityFilter: [...(options.active ?? [])],
      hideLimitedView: false,
      colorblindSafe: false,
      accessNeeds: options.needs ?? [
        { key: 'wheelchair', count: 12 },
        { key: 'companion', count: 3 },
      ],
    },
  };
  const commands = [
    'picker.setAccessibilityFilter',
    ...(options.view === false ? [] : ['picker.setLimitedViewFilter', 'picker.setColorblindSafe']),
  ];
  const caps = ['native-chrome-contract-v1', 'access-needs-v1',
    ...(options.view === false ? [] : ['colorblind-safe'])];
  const controller = {
    getSnapshot: () => snapshot,
    supportsAccessibleSectionTour: options.tour === true,
    setAccessibilityFilter: async (keys: readonly string[]) => { calls.push(['filter', ...keys]); },
    setLimitedViewFilter: async (on: boolean) => { calls.push(['limited', on]); },
    setColorblindSafe: async (on: boolean) => { calls.push(['colorblind', on]); },
    focusNextAccessibleSection: async () => undefined,
    mapController: {
      isReady: true,
      supportsPickerCapability: (key: string) => caps.includes(key),
      supportsPickerCommand: (key: string) => commands.includes(key),
    },
  };
  scope = {
    controller, snapshot, sessionId: 1, isBusy: false, readOnly: false, styles: {},
    presentation: { prompt: null },
    resolvedTheme: {
      colors: {
        text: '#111', background: '#eee', surface: '#fff', divider: '#ccc',
        accent: '#06f', onAccent: '#fff', mutedText: '#555',
      },
      fontFamily: 'Brand',
    },
    strings: {
      translate: (key: string, o?: { count?: number }) => {
        if (key === 'accessFreeCount') return `${o?.count} free`;
        const table: Record<string, string> = {
          accessibility: english.accessibility,
          accessibilityTitle: english.accessibilityTitle,
          displayOptions: english.displayOptions,
          close: english.close,
          hideLimitedView: english.hideLimitedView,
          colorblindSafe: english.colorblindSafe,
          companionSeatsNote: english.companionSeatsNote,
          notAvailable: english.notAvailable,
          viewGroupTitle: english.viewGroupTitle,
          accessJumpFirstSection: english.accessJumpFirstSection,
        };
        return table[key] ?? key;
      },
      accessNeed: (key: string) => key,
    },
    reportError: () => {},
    cancelPending: async () => true,
    claimPrompt: (_owner: string, kind: string, context: unknown) => ({
      lease: { context },
      open: () => { scope = { ...scope, presentation: { prompt: { kind, context } } }; return true; },
      dismiss: () => { scope = { ...scope, presentation: { prompt: null } }; return true; },
    }),
  };
  return { calls };
}

async function openSheet(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(SeatLayerPickerAccessibilityFilters, { compact: true }));
  });
  await act(async () => {
    renderer.root.findByProps({ accessibilityLabel: english.accessibility }).props.onPress();
    await Promise.resolve();
    renderer.update(React.createElement(SeatLayerPickerAccessibilityFilters, { compact: true }));
  });
  return renderer;
}

function row(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findByProps({ accessibilityRole: 'switch', accessibilityLabel: label });
}

function styleOf(node: any): Record<string, unknown> {
  const flat = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
  return Object.assign({}, ...flat.filter((entry: unknown) => entry && typeof entry === 'object'));
}

describe('the accessibility sheet is bounded and scrolls inside the bound (§3.5)', () => {
  it('takes a fraction of the screen, floored, and never more than the screen', () => {
    expect(seatLayerPickerAccessSheetMaxHeight(844))
      .toBeCloseTo(844 * size.accessSheetMaxHeightFraction, 6);
    // A short viewport gets the floor rather than a sliver…
    expect(seatLayerPickerAccessSheetMaxHeight(300)).toBe(size.accessSheetMinHeight);
    // …but the floor may never exceed the screen it is bounded by.
    expect(seatLayerPickerAccessSheetMaxHeight(180)).toBe(180);
    expect(seatLayerPickerAccessSheetMaxHeight(0)).toBe(0);
  });

  it('bounds the drawn sheet against the screen, not against its rows', async () => {
    setup();
    const renderer = await openSheet();
    const bounded = renderer.root.findAll((node: any) =>
      Array.isArray(node.props?.style) &&
      node.props.style.some((entry: any) => entry &&
        entry.maxHeight === seatLayerPickerAccessSheetMaxHeight(844)));
    expect(bounded.length).toBeGreaterThan(0);
  });

  it('scrolls the provision list alone, so the View switches stay reachable', async () => {
    setup();
    const renderer = await openSheet();
    const list = renderer.root.findByType('ScrollView' as any);
    expect(list.findAllByProps({ accessibilityRole: 'switch', accessibilityLabel: 'wheelchair' }))
      .toHaveLength(1);
    expect(list.findAllByProps({
      accessibilityRole: 'switch', accessibilityLabel: english.colorblindSafe,
    })).toHaveLength(0);
  });
});

describe('one aligned list of fixed rows (§3.5, Flutter 0.9.0/0.9.1)', () => {
  it('reads label · ⓘ · count · switch, with the ⓘ inside the label cell', async () => {
    setup();
    const renderer = await openSheet();
    const wheelchair = row(renderer, 'wheelchair');
    const cells = wheelchair.children.filter((child: any) => typeof child !== 'string') as any[];
    // icon cell, label cell (label + ⓘ), count column, the 12pt gap, switch.
    expect(cells).toHaveLength(5);
    expect(styleOf(cells[0]!).width).toBe(size.accessRowIconCell);
    // The ⓘ explains the WORDS beside it, so it lives in the label's own cell
    // rather than at the far end beside the switch.
    expect(cells[1]!.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(1);
    expect(cells[1]!.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel)
      .toBe(english.companionSeatsNote);
    expect(styleOf(cells[3]!).width).toBe(size.accessRowSwitchGap);
    expect(styleOf(cells[4]!).width).toBe(size.accessSwitchWidth);
  });

  it('keeps the count in its own column on every provision row', async () => {
    setup({ needs: [{ key: 'wheelchair', count: 12 }, { key: 'hearing' }] });
    const renderer = await openSheet();
    const counted = row(renderer, 'wheelchair').children
      .filter((child: any) => typeof child !== 'string') as any[];
    const uncounted = row(renderer, 'hearing').children
      .filter((child: any) => typeof child !== 'string') as any[];
    // The column is reserved on BOTH, so the figures line up down the sheet
    // even where one provision was never counted.
    expect(styleOf(counted[2]!).width).toBe(styleOf(uncounted[2]!).width);
    // The two View switches carry no count column at all.
    const view = row(renderer, english.colorblindSafe).children
      .filter((child: any) => typeof child !== 'string') as any[];
    expect(view).toHaveLength(4);
  });

  it('shows a sold-out provision as 0 and dims it, never as a sentence', async () => {
    setup({ needs: [{ key: 'wheelchair', count: 0 }, { key: 'hearing' }] });
    const renderer = await openSheet();
    const wheelchair = row(renderer, 'wheelchair');
    expect(wheelchair.props.accessibilityState).toMatchObject({ disabled: true });
    expect(styleOf(wheelchair).opacity).toBeLessThan(1);
    const texts = renderer.root.findAllByType('Text' as any)
      .map((node: any) => String(node.children?.[0] ?? ''));
    expect(texts).toContain('0');
    expect(texts).not.toContain(english.notAvailable);
    // An uncounted provision shows no number and stays live: absent is not zero.
    expect(row(renderer, 'hearing').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('closes each row with a hairline, and the last row of the sheet without one', async () => {
    setup();
    const renderer = await openSheet();
    expect(styleOf(row(renderer, 'wheelchair')).borderBottomWidth).toBeGreaterThan(0);
    expect(styleOf(row(renderer, english.hideLimitedView)).borderBottomWidth).toBeGreaterThan(0);
    expect(styleOf(row(renderer, english.colorblindSafe)).borderBottomWidth).toBeUndefined();
  });

  it('toggles from anywhere on the row, not from the switch alone', async () => {
    const runtime = setup();
    const renderer = await openSheet();
    await act(async () => {
      row(renderer, 'wheelchair').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(runtime.calls).toEqual([['filter', 'wheelchair']]);
  });

  it('heads the two map switches with the View group, and omits it where they are absent', async () => {
    setup();
    const withView = await openSheet();
    expect(withView.root.findAllByProps({ children: english.viewGroupTitle })).not.toHaveLength(0);

    setup({ view: false });
    const without = await openSheet();
    expect(without.root.findAllByProps({ children: english.viewGroupTitle })).toHaveLength(0);
  });
});

describe('the longer explanation sits behind the ⓘ (§3.5)', () => {
  it('opens the sentence under the row it explains and closes it again', async () => {
    setup();
    const renderer = await openSheet();
    const note = () => renderer.root.findAllByProps({ children: english.companionSeatsNote })
      .filter((node: any) => node.type === 'Text');
    // One line per row: the sentence is not drawn until it is asked for.
    expect(note()).toHaveLength(0);
    const button = row(renderer, 'wheelchair').findByProps({ accessibilityRole: 'button' });
    expect(button.props.accessibilityState).toMatchObject({ expanded: false });
    await act(async () => { button.props.onPress(); });
    expect(note()).not.toHaveLength(0);
    await act(async () => {
      row(renderer, 'wheelchair').findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(note()).toHaveLength(0);
  });

  it('carries no note where the chart authors no companion places', async () => {
    setup({ needs: [{ key: 'wheelchair', count: 4 }] });
    const renderer = await openSheet();
    expect(row(renderer, 'wheelchair').findAllByProps({ accessibilityRole: 'button' }))
      .toHaveLength(0);
  });
});

describe('every row wears the drawing that row is about (§3.5)', () => {
  it('draws one glyph per row, hidden from assistive technology', async () => {
    setup();
    const renderer = await openSheet();
    for (const label of ['wheelchair', 'companion', english.hideLimitedView, english.colorblindSafe]) {
      const cell = row(renderer, label).children
        .filter((child: any) => typeof child !== 'string')[0] as any;
      expect(cell.props.accessible).toBe(false);
      expect(styleOf(cell).width).toBe(size.accessRowIconCell);
      expect(cell.children.length).toBeGreaterThan(0);
    }
    // Never a typed character: the platform paints U+267F in its own colours.
    const texts = renderer.root.findAllByType('Text' as any)
      .map((node: any) => String(node.children?.[0] ?? ''));
    expect(texts.some((text) => text.includes('♿'))).toBe(false);
  });

  it('is still standing on the placeholder set until the shared glyphs land', () => {
    // Lane A owns `seatIcons.tsx` (§3.8.9). This flag is the one thing to
    // delete when it is merged, and it fails loudly if it is forgotten.
    expect(seatLayerPickerAccessRowGlyphIsPlaceholder).toBe(true);
  });
});

describe('the row names come from the generated short set (§3.5)', () => {
  it('names a provision in the buyer language, English included', async () => {
    const { createSeatLayerPickerStringResolver } = await import('../src/picker/locale');
    // The extractor takes all thirty-seven from the runtime's own
    // `picker.accessShort.*`, so the sheet, the seat card and the runtime say
    // the same words. English has no locale dictionary of its own, so it used
    // to fall through to the longer names in the token table.
    expect(createSeatLayerPickerStringResolver({ locale: 'en' }).accessNeed('wheelchair'))
      .toBe('Wheelchair space');
    expect(createSeatLayerPickerStringResolver({}).accessNeed('semi-ambulatory'))
      .toBe('Limited mobility');
    expect(createSeatLayerPickerStringResolver({ locale: 'fr' }).accessNeed('wheelchair'))
      .toBe('Emplacement fauteuil roulant');
    // A host override still wins, and an unknown key is still its own name.
    expect(createSeatLayerPickerStringResolver({
      overrides: { accessNeeds: { wheelchair: 'Wheelchair bays' } },
    }).accessNeed('wheelchair')).toBe('Wheelchair bays');
    expect(createSeatLayerPickerStringResolver({ locale: 'fr' }).accessNeed('quiet-room'))
      .toBe('quiet-room');
  });
});
