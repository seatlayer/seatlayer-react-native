import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const focused: unknown[] = [];
(globalThis as never as { __slFocus: unknown[] }).__slFocus = focused;

vi.mock('react-native', () => {
  class Value {
    constructor(public value: number) {}
    setValue(next: number) { this.value = next; }
    interpolate({ outputRange }: { outputRange: (number | string)[] }) { return outputRange[outputRange.length - 1]; }
  }
  const animation = (onDone?: () => void) => ({
    start: (done?: (result: { finished: boolean }) => void) => { onDone?.(); done?.({ finished: true }); },
    stop: () => undefined,
  });
  return {
    AccessibilityInfo: {
      setAccessibilityFocus: (handle: unknown) => { (globalThis as never as { __slFocus: unknown[] }).__slFocus.push(handle); },
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => undefined }),
    },
    Animated: {
      View: 'Animated.View',
      Value,
      timing: (value: Value, config: { toValue: number }) => animation(() => value.setValue(config.toValue)),
      sequence: () => animation(),
      delay: () => animation(),
      loop: () => animation(),
    },
    Easing: { bezier: () => 'bezier', inOut: () => 'inOut', ease: 'ease' },
    I18nManager: { isRTL: false }, Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View',
    findNodeHandle: () => 7,
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1, absoluteFill: { position: 'absolute' } },
  };
});

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));
vi.mock('../src/picker/SeatLayerPickerDecisionPrompts', () => ({
  SeatLayerPickerSeatTierSelector: ({ onValueChange }: { onValueChange?: (value: string) => void }) =>
    React.createElement('Pressable', { accessibilityLabel: 'chooseChildTier', onPress: () => onValueChange?.('child') }),
}));

import { SeatLayerConfirmCard } from '../src/picker/SeatLayerConfirmCard';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';
import { createSeatLayerPickerStringResolver } from '../src/picker/locale';
import { seatLayerPickerSeatNotePalette, seatLayerPickerSeatNoteToneColors } from '../src/picker/seatNotes';

const photoSeat = {
  id: 'seat-a', label: 'inventory-a', sectionLabel: 'Orchestra', rowLabel: 'A', seatNumber: '12',
  price: 42, currency: 'USD', seatViewThumb: { reference: '/pub/events/event/assets/a1', kind: 'real' },
  sightlineMetres: 24,
};

function pickerSnapshot(overrides: Partial<SeatLayerPickerSnapshot> = {}): SeatLayerPickerSnapshot {
  return {
    schema: 'seatlayer.picker.snapshot/1', sessionId: 'runtime', revision: 1,
    event: { key: 'event', name: 'Event', mode: 'sale', currency: 'USD', salesClosed: false }, branding: { attributionRequired: false },
    categories: [{ key: 'gold', label: 'Gold', color: '#F5E663', price: 42 }], zones: [], sections: [{ id: 'orchestra', label: 'Orchestra' }],
    bestAvailableZones: [], generalAdmissionAreas: [],
    map: { rung: 'overview', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'orbit', colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true, categoryFilter: [], accessibilityFilter: [], floors: [] },
    selection: [{ id: 'seat-a', label: 'inventory-a', categoryKey: 'gold', sectionLabel: 'Orchestra', rowLabel: 'A', seatNumber: '12', price: 42, currency: 'USD' }],
    maxSelection: 4, ticketCount: 1, cartLines: [], cartTotal: 42, currency: 'USD', hold: { active: false }, accessConfigured: true, accessStatus: 'available', capabilities: [], raw: null,
    ...overrides,
  } as SeatLayerPickerSnapshot;
}

function setup(snapshot = pickerSnapshot(), options: { thumbnails?: boolean; retap?: boolean } = {}) {
  let current = snapshot; let pending: any = snapshot.selection[0]; const commands: unknown[][] = []; const errors: unknown[] = [];
  let confirmed = 0; let cancelled = 0; let readOnly = false; let nativeSeatChrome = false;
  let seatView: { seatId?: string } | undefined; const seatViewListeners = new Set<() => void>();
  const retapListeners = new Set<(seat: unknown) => void>();
  const controller = {
    getSnapshot: () => current,
    mapController: {
      isReady: true,
      supportsPickerCapability: (value: string) =>
        (options.thumbnails === true && value === 'seat-view-thumbnail-v1') ||
        ['tiers', 'seat-view-v1', 'venue-3d-v1'].includes(value),
      supportsPickerCommand: (value: string) => ['picker.setSeatTier', 'picker.openSeatView', 'picker.setBuyerView'].includes(value),
    },
    supportsSelectionFocus: true,
    setSelectionFocus: async (seatId: string | null) => { commands.push(['focus', seatId]); },
    removeCartLine: async (label: string) => { commands.push(['removeCartLine', label]); },
    subscribeSeatRetap: (listener: (seat: unknown) => void) => {
      if (options.retap === false) return () => undefined;
      retapListeners.add(listener);
      return () => retapListeners.delete(listener);
    },
    get supportsSeatView() { return current.capabilities.includes('seatView'); },
    get supportsVenue3D() { return current.capabilities.includes('venue3d'); },
    get supportsNativeSeatViewChrome() { return nativeSeatChrome; },
    setSeatTier: async (...args: unknown[]) => { commands.push(['tier', ...args]); },
    openSeatView: async (id: string) => { commands.push(['seatView', id]); },
    setBuyerView: async (...args: unknown[]) => { commands.push(['venue3d', ...args]); },
    getSeatView: () => seatView,
    subscribeSeatView: (listener: () => void) => { seatViewListeners.add(listener); return () => seatViewListeners.delete(listener); },
  };
  const publishScope = () => {
    scope = {
      controller, snapshot: current, pendingSeat: pending, sessionId: 1, isBusy: false, readOnly,
      configuration: { event: 'event', buyerAccessToken: { token: 't' } },
      confirmPending: () => { confirmed += 1; pending = null; },
      cancelPending: async () => { if (!pending || pending.id !== current.selection[0]?.id) return false; cancelled += 1; pending = null; return true; },
      reportError: (error: unknown) => errors.push(error), styles: {},
      formatMoney: (amount: number, currency: string) => `${currency === 'USD' ? '$' : `${currency} `}${amount}`,
      strings: createSeatLayerPickerStringResolver(),
      resolvedTheme: { colors: { surface: '#fff', divider: '#ccc', accent: '#06f', text: '#111', onAccent: '#fff', mutedText: '#666', error: '#b00', warning: '#fa0' }, fontFamily: 'Brand' },
    };
  };
  publishScope();
  return {
    commands, errors, controller, counts: () => ({ confirmed, cancelled }),
    update: (next: SeatLayerPickerSnapshot, nextPending = next.selection[0]) => { current = next; pending = nextPending; publishScope(); },
    replaceController: () => { scope = { ...scope, controller: { ...controller } }; },
    setReadOnly: (next: boolean) => { readOnly = next; publishScope(); },
    setNativeSeatChrome: (next: boolean) => { nativeSeatChrome = next; },
    setPending: (next: unknown) => { pending = next; publishScope(); },
    retap: (seat: unknown) => { for (const listener of [...retapListeners]) listener(seat); },
    setVenueTarget: (id: string | undefined) => { current = { ...current, map: { ...current.map, buyerView: 'venue3d', view3DTargetSeatId: id } } as SeatLayerPickerSnapshot; publishScope(); },
    mountSeatView: (id?: string) => { seatView = id === undefined ? undefined : { seatId: id }; for (const listener of seatViewListeners) listener(); },
  };
}

async function mount(props: Record<string, unknown> = {}): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, props)); });
  return renderer;
}
const find = (tree: ReactTestRenderer, testID: string) => tree.root.findByProps({ testID });
const findAll = (tree: ReactTestRenderer, testID: string) => tree.root.findAllByProps({ testID });
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType('Text' as never).map((node) => node.props.children);


const notedSeat = {
  id: 'seat-a', label: 'inventory-a', categoryKey: 'gold', sectionLabel: 'Orchestra',
  rowLabel: 'A', seatNumber: '12', price: 42, currency: 'USD',
  accessibility: ['hearing', 'wheelchair'], wheelchairSpaceType: 'no-seat',
  commercial: { restrictedView: true, obstructedView: true, premium: true, note: 'Pillar at the aisle end.' },
};

describe('§3.8.9 the card draws the one row model as bands', () => {
  it('prints every attribute the seat carries, in the fixed order, under the category band', async () => {
    setup(pickerSnapshot({ selection: [notedSeat] as never }));
    const tree = await mount();
    const block = find(tree, 'seatLayerConfirmSeatNotes');
    const keys = block.findAllByProps({ accessible: undefined })
      .map((node) => node.props.testID as string | undefined)
      .filter((id): id is string => typeof id === 'string' && id.startsWith('seatLayerConfirmSeatNote-'));
    expect([...new Set(keys)]).toEqual([
      'seatLayerConfirmSeatNote-access:hearing',
      'seatLayerConfirmSeatNote-wheelchair:no-seat',
      'seatLayerConfirmSeatNote-mark:restrictedView',
      'seatLayerConfirmSeatNote-mark:obstructedView',
      'seatLayerConfirmSeatNote-mark:premium',
    ]);
    const printed = texts(tree);
    expect(printed).toContain('Assistive listening');
    expect(printed).toContain('Empty wheelchair space');
    expect(printed).toContain('Restricted view');
    expect(printed).toContain('Obstructed view');
    expect(printed).toContain('Premium seat');
    // The organizer's sentence explains the FIRST selling mark rather than
    // becoming a row of its own.
    expect(printed).toContain('Pillar at the aisle end.');
    expect(printed).not.toContain('Organizer note');
  });

  it('draws them as bands: no hairline above the first, one on every join', async () => {
    setup(pickerSnapshot({ selection: [notedSeat] as never }));
    const tree = await mount();
    const bands = findAllBands(tree);
    expect(bands.length).toBe(5);
    expect(flat(bands[0]!.props.style).borderTopWidth).toBe(0);
    for (const band of bands.slice(1)) expect(flat(band.props.style).borderTopWidth).toBeGreaterThan(0);
    // A band is the card's full width: no radius, no border, no inset.
    for (const band of bands) {
      const style = flat(band.props.style);
      expect(style.borderRadius).toBeUndefined();
      expect(style.paddingStart).toBe(seatLayerPickerTokens.size.notePadX);
      expect(style.paddingTop).toBe(seatLayerPickerTokens.size.notePadY);
    }
  });

  it('paints each tone with the theme ink measured against its own ground', async () => {
    setup(pickerSnapshot({ selection: [notedSeat] as never }));
    const tree = await mount();
    const palette = seatLayerPickerSeatNotePalette(
      { surface: '#fff', divider: '#ccc', text: '#111', mutedText: '#666', warning: '#fa0' }, 'light',
    );
    const bands = findAllBands(tree);
    expect(flat(bands[0]!.props.style).backgroundColor)
      .toBe(seatLayerPickerSeatNoteToneColors(palette, 'access').ground);
    expect(flat(bands[2]!.props.style).backgroundColor)
      .toBe(seatLayerPickerSeatNoteToneColors(palette, 'warn').ground);
    expect(flat(bands[4]!.props.style).backgroundColor)
      .toBe(seatLayerPickerSeatNoteToneColors(palette, 'premium').ground);
    expect(tree.root.findAllByProps({ testID: 'seatLayerSeatIcon-premium' }).length).toBeGreaterThan(0);
  });

  it('draws no block at all for a seat with nothing marked on it', async () => {
    setup();
    const tree = await mount();
    expect(tree.root.findAllByProps({ testID: 'seatLayerConfirmSeatNotes' })).toEqual([]);
  });
});

function findAllBands(tree: ReactTestRenderer) {
  return tree.root.findAll((node) =>
    typeof node.props?.testID === 'string' && node.props.testID.startsWith('seatLayerConfirmSeatNote-'));
}

function flat(style: unknown): Record<string, never> {
  const parts = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...parts.filter((part) => part && typeof part === 'object')) as Record<string, never>;
}
