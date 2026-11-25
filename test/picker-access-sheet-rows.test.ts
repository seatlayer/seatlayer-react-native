import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let windowHeight = 844;
let windowText = 1;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Image: 'Image', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
  useWindowDimensions: () => ({ fontScale: windowText, width: 390, height: windowHeight }),
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
  seatLayerPickerAccessSheetScrollsWhole,
  seatLayerPickerAccessSheetWholeHeight,
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
          showSeatsFor: 'SHOW SEATS FOR',
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
    // The disc's own label carries the active filter count, so the opener is
    // the only BUTTON standing before the sheet is up, not a fixed string.
    renderer.root.findAllByProps({ accessibilityRole: 'button' })
      .find((node) => typeof node.props.onPress === 'function')!.props.onPress();
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

describe('a screen too short for the switches and the list', () => {
  const room = (screenHeight: number, bottomInset: number, switches: number, fontScale: number, screenWidth = 390) =>
    ({ screenWidth, screenHeight, topInset: 0, bottomInset, switches, fontScale });
  const whole = (...of: Parameters<typeof room>) => seatLayerPickerAccessSheetScrollsWhole(room(...of));

  it('is a phone held sideways, at any text size', () => {
    for (const [height, inset] of [[375, 0], [390, 21], [412, 24]] as const) {
      for (const text of [1, 1.3, 2]) expect(whole(height, inset, 2, text, height * 2)).toBe(true);
    }
  });

  it('is not a phone held upright', () => {
    for (const [height, inset] of [[568, 0], [667, 0], [740, 24], [844, 34], [932, 34]] as const) {
      expect(whole(height, inset, 2, 1)).toBe(false);
    }
    // A text size the platform could not say counts as 1.
    expect(whole(844, 34, 2, Number.NaN)).toBe(false);
  });

  it('cuts a row in half there, so a list that runs on is seen to', () => {
    // Title 88, two switches 100, the group's heading 38, then rows of 50.
    for (const height of [375, 390, 412]) {
      expect(seatLayerPickerAccessSheetWholeHeight(room(height, 0, 2, 1, height * 2))).toBe(88 + 100 + 38 + 75);
    }
    // Never over the status bar, however large the words.
    expect(seatLayerPickerAccessSheetWholeHeight({ ...room(375, 0, 2, 3, 667), topInset: 20 })).toBe(375 - 20 - 44);
  });

  it('runs the list on to the foot of the sheet, with the room after its last row', async () => {
    setup();
    const renderer = await openSheet();
    expect(styleOf(renderer.root.findByType('ScrollView' as any).parent!).paddingBottom).toBe(0);
    expect(renderer.root.findByType('ScrollView' as any).props.contentContainerStyle.paddingBottom).toBeGreaterThanOrEqual(24);
  });

  it('never cuts a name, and stands a count under it at a large text size', async () => {
    const countOf = (renderer: ReactTestRenderer) => {
      const name = row(renderer, 'wheelchair').findAllByType('Text' as any);
      for (const text of name) expect(text.props.numberOfLines).toBeUndefined();
      return name[1]!.parent!;
    };
    setup();
    expect(styleOf(countOf(await openSheet()))).toEqual(expect.objectContaining({ alignItems: 'flex-end', minWidth: 68 }));
    windowText = 2;
    try {
      setup();
      expect(styleOf(countOf(await openSheet())).alignItems).toBe('flex-start');
    } finally { windowText = 1; }
  });

  it('scrolls the switches with the list under the title', async () => {
    windowHeight = 390;
    try {
      setup();
      const renderer = await openSheet();
      const list = renderer.root.findByType('ScrollView' as any);
      for (const accessibilityLabel of ['wheelchair', english.colorblindSafe]) {
        expect(list.findAllByProps({ accessibilityRole: 'switch', accessibilityLabel })).toHaveLength(1);
      }
      expect(list.findAllByProps({ accessibilityRole: 'header' })).toHaveLength(1);
    } finally {
      windowHeight = 844;
    }
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

  it('keeps a sold-out switch LIVE while it is on, and lets the last one off', async () => {
    // The buyer holding the last space is the one who emptied it. A filter
    // they cannot turn off traps them on a map with nothing left to show, so
    // an ON row stays live at zero; a sold-out row that is OFF stays disabled,
    // because there is nothing there to filter to.
    const runtime = setup({ needs: [{ key: 'wheelchair', count: 0 }, { key: 'companion', count: 0 }], active: ['wheelchair'] });
    const renderer = await openSheet();
    expect(row(renderer, 'wheelchair').props.accessibilityState)
      .toMatchObject({ checked: true, disabled: false });
    expect(row(renderer, 'companion').props.accessibilityState)
      .toMatchObject({ checked: false, disabled: true });
    // Turning the LAST one off empties the set, and an empty set is `null` on
    // the wire — "no filter", not "a filter matching nothing".
    await act(async () => {
      row(renderer, 'wheelchair').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(runtime.calls).toEqual([['filter']]);
  });

  it('closes each row with a hairline, and the last map switch without one', async () => {
    setup();
    const renderer = await openSheet();
    expect(styleOf(row(renderer, 'wheelchair')).borderBottomWidth).toBeGreaterThan(0);
    expect(styleOf(row(renderer, english.hideLimitedView)).borderBottomWidth).toBeGreaterThan(0);
    expect(styleOf(row(renderer, english.colorblindSafe)).borderBottomWidth).toBeUndefined();
  });

  it('draws the knob at the end it is switched to, whichever way the layout reads', async () => {
    setup({ active: ['wheelchair'] });
    const renderer = await openSheet();
    const track = (label: string) => styleOf(row(renderer, label).findAllByType('View' as any).slice(-2)[0]!);
    expect(track('wheelchair')).toEqual(expect.objectContaining({ flexDirection: 'row', justifyContent: 'flex-end' }));
    expect(track('companion')).toEqual(expect.objectContaining({ flexDirection: 'row', justifyContent: 'flex-start' }));
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

  it('puts the two map switches first, and a heading over the provisions', async () => {
    setup();
    const renderer = await openSheet();
    const drawn = JSON.stringify(renderer.toJSON());
    const order = [english.hideLimitedView, english.colorblindSafe, 'SHOW SEATS FOR', 'wheelchair']
      .map((words) => drawn.indexOf(`"${words}"`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(renderer.root.findAllByProps({ children: english.viewGroupTitle })).toHaveLength(0);

    setup({ view: false });
    const without = await openSheet();
    expect(without.root.findAllByProps({ children: 'SHOW SEATS FOR' })).not.toHaveLength(0);
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

  it('takes its drawings from the SHARED set the seat card uses', async () => {
    // §3.8.9: one drawing per attribute across every surface. A sheet with its
    // own icons meant the same seat wore a different mark depending on where
    // the buyer met it.
    const { seatLayerPickerHasSeatIcon } = await import('../src/picker/seatIcons');
    setup({ needs: [{ key: 'wheelchair', count: 4 }, { key: 'companion', count: 2 }] });
    const renderer = await openSheet();
    for (const key of ['wheelchair', 'companion']) {
      expect(seatLayerPickerHasSeatIcon(key)).toBe(true);
      expect(row(renderer, key).findAllByProps({ testID: `seatLayerSeatIcon-${key}` }).length)
        .toBeGreaterThan(0);
    }
  });
});

describe('the row names come from the generated short set (§3.5)', () => {
  it('names a provision in the buyer language, English from the tokens', async () => {
    const { createSeatLayerPickerStringResolver } = await import('../src/picker/locale');
    const { seatLayerPickerLocaleWords } = await import('../src/picker/locale');
    // The extractor takes the other thirty-six from the runtime's own
    // `picker.accessShort.*`, so a French sheet, a French seat card and the
    // runtime say the same words. Nothing read them, and a French picker
    // printed English on every row.
    expect(createSeatLayerPickerStringResolver({ locale: 'fr' }).accessNeed('wheelchair'))
      .toBe('Emplacement fauteuil roulant');
    expect(createSeatLayerPickerStringResolver({ locale: 'de' }).accessNeed('semi-ambulatory'))
      .toBe(seatLayerPickerLocaleWords('de')['accessNeeds.semi-ambulatory']);
    // English keeps the short names in the token table, which is what the
    // reference draws: it deliberately has no locale dictionary of its own.
    expect(createSeatLayerPickerStringResolver({ locale: 'en' }).accessNeed('wheelchair'))
      .toBe(english.accessWheelchair);
    expect(createSeatLayerPickerStringResolver({}).accessNeed('semi-ambulatory'))
      .toBe(english.accessSemiAmbulatory);
    // A host override still wins, and an unknown key is still its own name.
    expect(createSeatLayerPickerStringResolver({
      overrides: { accessNeeds: { wheelchair: 'Wheelchair bays' } },
    }).accessNeed('wheelchair')).toBe('Wheelchair bays');
    expect(createSeatLayerPickerStringResolver({ locale: 'fr' }).accessNeed('quiet-room'))
      .toBe('quiet-room');
  });
});

describe('the row is one element, so its extras are actions on it (§4.10)', () => {
  it('offers the ⓘ as an action on the row, labelled with the sentence itself', async () => {
    setup();
    const renderer = await openSheet();
    const wheelchair = row(renderer, 'wheelchair');
    // The whole row is the switch, so the drawn ⓘ inside it is not reachable
    // on iOS at all. The action rotor is where the platform keeps a control's
    // second answer.
    expect(wheelchair.props.accessibilityActions)
      .toContainEqual({ name: 'seatlayer-access-note', label: english.companionSeatsNote });
    const note = () => renderer.root.findAllByProps({ children: english.companionSeatsNote })
      .filter((node: any) => node.type === 'Text');
    expect(note()).toHaveLength(0);
    await act(async () => {
      wheelchair.props.onAccessibilityAction({ nativeEvent: { actionName: 'seatlayer-access-note' } });
    });
    expect(note()).not.toHaveLength(0);
  });

  it('offers the count-as-jump as a second action, and takes the flight', async () => {
    const runtime = setup({ tour: true });
    const renderer = await openSheet();
    const wheelchair = row(renderer, 'wheelchair');
    expect(wheelchair.props.accessibilityActions)
      .toContainEqual({ name: 'seatlayer-access-jump', label: english.accessJumpFirstSection });
    await act(async () => {
      wheelchair.props.onAccessibilityAction({ nativeEvent: { actionName: 'seatlayer-access-jump' } });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(runtime.calls).toContainEqual(['filter', 'wheelchair']);
  });

  it('gives a row with neither extra no actions at all', async () => {
    setup({ needs: [{ key: 'wheelchair', count: 4 }] });
    const renderer = await openSheet();
    expect(row(renderer, 'wheelchair').props.accessibilityActions).toBeUndefined();
    expect(row(renderer, english.colorblindSafe).props.accessibilityActions).toBeUndefined();
  });
});
