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
      strings: { translate: (key: string, opts?: { values?: Record<string, string> }) => {
        if (key === 'rowIdentity') return `Row ${opts?.values?.row}`;
        if (key === 'seatNumberIdentity') return `Seat ${opts?.values?.seat}`;
        if (key === 'seatIdentity') return opts?.values?.parts ?? '';
        if (key === 'sightline') return `~ ${opts?.values?.m} m`;
        return key;
      } },
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

describe('§3.8.3 the card’s anatomy', () => {
  it('prints three equal identity cells, then the band, then the answers', async () => {
    setup();
    const tree = await mount();
    const cells = find(tree, 'seatLayerConfirmIdentity').props.children;
    expect(cells).toHaveLength(3);
    expect(texts(tree).slice(0, 6)).toEqual(['SECTIONWORD', 'Orchestra', 'ROWWORD', 'A', 'SEATWORD', '12']);
    expect(find(tree, 'seatLayerConfirmBand')).toBeTruthy();
    expect(find(tree, 'seatLayerConfirmPrimary').props.accessibilityLabel).toBe('addSeat');
    expect(find(tree, 'seatLayerConfirmCancel').props.accessibilityLabel).toBe('cancel');
  });

  it('prints the category name and the price on the band and nothing else', async () => {
    setup();
    const band = find(await mount(), 'seatLayerConfirmBand');
    const printed = band.findAllByType('Text' as never).map((node) => node.props.children);
    expect(printed).toEqual(['Gold', '$42']);
  });

  it('chooses the band ink against the category’s own colour', async () => {
    setup();
    const band = find(await mount(), 'seatLayerConfirmBand');
    // #F5E663 is pale, so white would fail the 3:1 floor and the near-black wins.
    for (const node of band.findAllByType('Text' as never)) {
      const merged = Object.assign({}, ...[node.props.style].flat(2));
      expect(merged.color).toBe('#0B0F19');
    }
  });

  it('gives the quiet answer just over a third of the decision row', async () => {
    setup();
    const cancel = find(await mount(), 'seatLayerConfirmCancel');
    const merged = Object.assign({}, ...[cancel.props.style].flat(2));
    expect(merged.flexBasis).toBe('34%');
    expect(merged.flexGrow).toBe(0);
  });

  it('draws no strip at all where the seat names no photograph, and offers 3D on the row', async () => {
    setup();
    const tree = await mount();
    expect(findAll(tree, 'seatLayerConfirmPhotoStrip')).toHaveLength(0);
    expect(findAll(tree, 'seatLayerConfirm3dSquare')).toHaveLength(0);
    const withVenue = await (async () => { setup(pickerSnapshot({ capabilities: ['venue3d'] })); return mount(); })();
    expect(findAll(withVenue, 'seatLayerConfirmPhotoStrip')).toHaveLength(0);
    const square = find(withVenue, 'seatLayerConfirm3dSquare');
    expect(square.props.accessibilityLabel).toBe('seeItIn3D');
  });

  it('scales the answer down before it truncates, and clamps the platform’s scale', async () => {
    setup();
    const primary = find(await mount(), 'seatLayerConfirmPrimary');
    const label = primary.findAllByType('Text' as never)[0]!;
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.maxFontSizeMultiplier).toBe(seatLayerPickerTokens.type.scaleClamp.card);
  });
});

describe('§3.8.3 the photograph', () => {
  it('draws the strip, its two pills and the sight line where the runtime names one', async () => {
    setup(pickerSnapshot({ capabilities: ['seatView', 'venue3d'], selection: [photoSeat] as never }), { thumbnails: true });
    const tree = await mount();
    expect(find(tree, 'seatLayerConfirmPhotoStrip')).toBeTruthy();
    expect(find(tree, 'seatLayerConfirmPill-seatView').props.accessibilityLabel).toBe('viewFromHere');
    expect(find(tree, 'seatLayerConfirmPill-venue3d').props.accessibilityLabel).toBe('seeItIn3D');
    expect(find(tree, 'seatLayerConfirmSightline').findAllByType('Text' as never)[0]!.props.children).toBe('~ 24 m');
    // The strip's pill wins, so the decision row keeps no square of its own.
    expect(findAll(tree, 'seatLayerConfirm3dSquare')).toHaveLength(0);
  });

  it('reads none of it on a runtime that does not advertise the capability', async () => {
    setup(pickerSnapshot({ capabilities: ['venue3d'], selection: [photoSeat] as never }), { thumbnails: false });
    const tree = await mount();
    expect(findAll(tree, 'seatLayerConfirmPhotoStrip')).toHaveLength(0);
    expect(findAll(tree, 'seatLayerConfirmSightline')).toHaveLength(0);
    expect(find(tree, 'seatLayerConfirm3dSquare')).toBeTruthy();
  });
});

describe('§3.8.1a the card names its candidate to the runtime', () => {
  it('focuses the seat on open and clears the focus when it closes', async () => {
    const runtime = setup();
    const tree = await mount();
    await act(async () => { await Promise.resolve(); });
    expect(runtime.commands).toContainEqual(['focus', 'seat-a']);
    await act(async () => { tree.unmount(); });
    expect(runtime.commands).toContainEqual(['focus', null]);
  });
});

describe('§3.8.4a the same card asking the opposite question', () => {
  it('raises the remove card on a retap and takes the seat out down the cart’s own path', async () => {
    const runtime = setup();
    runtime.setPending(null);
    const tree = await mount();
    expect(tree.toJSON()).toBeNull();
    await act(async () => { runtime.retap(runtime.controller.getSnapshot().selection[0]); });
    const primary = find(tree, 'seatLayerConfirmPrimary');
    expect(primary.props.accessibilityLabel).toBe('removeSeat');
    expect(find(tree, 'seatLayerConfirmCross')).toBeTruthy();
    await act(async () => { primary.props.onPress(); await Promise.resolve(); });
    expect(runtime.commands).toContainEqual(['removeCartLine', 'inventory-a']);
  });

  it('keeps the seat when the buyer cancels out of the question', async () => {
    const runtime = setup();
    runtime.setPending(null);
    const tree = await mount();
    await act(async () => { runtime.retap(runtime.controller.getSnapshot().selection[0]); });
    await act(async () => { find(tree, 'seatLayerConfirmCancel').props.onPress(); });
    expect(runtime.commands.filter(([name]) => name === 'removeCartLine')).toHaveLength(0);
    expect(tree.toJSON()).toBeNull();
  });

  it('lets an unanswered add outrank a retap', async () => {
    const runtime = setup();
    const tree = await mount();
    await act(async () => { runtime.retap(runtime.controller.getSnapshot().selection[0]); });
    expect(findAll(tree, 'seatLayerConfirmPrimary')).toHaveLength(1);
    expect(find(tree, 'seatLayerConfirmPrimary').props.accessibilityLabel).toBe('addSeat');
  });

  it('never raises it on a read-only picker', async () => {
    const runtime = setup();
    runtime.setPending(null);
    runtime.setReadOnly(true);
    const tree = await mount();
    await act(async () => { runtime.retap(runtime.controller.getSnapshot().selection[0]); });
    expect(tree.toJSON()).toBeNull();
  });
});

describe('§3.8.6 the card is a dialog', () => {
  it('names itself with the identity sentence and offers both answers as custom actions', async () => {
    setup();
    const tree = await mount();
    const card = find(tree, 'seatLayerConfirmCard');
    expect(card.props.accessibilityViewIsModal).toBe(true);
    expect(card.props.accessibilityLabel).toBe('Orchestra · rowWord A · seatWord 12 · Gold · $42');
    expect(card.props.accessibilityActions).toEqual([
      { name: 'activate', label: 'addSeat' },
      { name: 'cancel', label: 'cancel' },
    ]);
  });

  it('answers both custom actions the way the buttons do', async () => {
    const runtime = setup();
    const tree = await mount();
    await act(async () => { find(tree, 'seatLayerConfirmCard').props.onAccessibilityAction({ nativeEvent: { actionName: 'cancel' } }); });
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 1 });
  });

  it('lands the focus on the answer the card exists to collect', async () => {
    setup();
    focused.length = 0;
    await mount();
    expect(focused).toEqual([7]);
  });
});

describe('the workflow the card shares with the wide composition', () => {
  it('confirms locally, observes once, and retires when the selection turns variable', async () => {
    const runtime = setup(); const observed: any[] = [];
    const tree = await mount({ onAction: (event: unknown) => observed.push(event) });
    await act(async () => { find(tree, 'seatLayerConfirmPrimary').props.onPress(); });
    expect(runtime.counts()).toEqual({ confirmed: 1, cancelled: 0 });
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({ action: 'confirm', seat: { id: 'seat-a' } });
    runtime.update(pickerSnapshot({ selection: [{ id: 'table', label: 'table', objectType: 'table', bookingMode: 'variable' }] as never }));
    await act(async () => { tree.update(React.createElement(SeatLayerConfirmCard)); });
    expect(tree.toJSON()).toBeNull();
  });

  it('ignores a second press while the first is committing', async () => {
    const runtime = setup(); const observed: string[] = [];
    const tree = await mount({ onAction: ({ action }: { action: string }) => { observed.push(action); } });
    const press = find(tree, 'seatLayerConfirmPrimary').props.onPress;
    await act(async () => { press(); press(); });
    expect(runtime.counts().confirmed).toBe(1);
    expect(observed).toEqual(['confirm']);
  });

  it('uses exact cancellation and makes a stale press inert after a controller replacement', async () => {
    const runtime = setup(); const observed: string[] = [];
    const tree = await mount({ onAction: ({ action }: { action: string }) => { observed.push(action); } });
    const stale = find(tree, 'seatLayerConfirmCancel').props.onPress;
    runtime.replaceController();
    await act(async () => { tree.update(React.createElement(SeatLayerConfirmCard, { onAction: ({ action }: { action: string }) => { observed.push(action); } })); });
    await act(async () => { stale(); });
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 0 });
    await act(async () => { find(tree, 'seatLayerConfirmCancel').props.onPress(); });
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 1 });
    expect(observed).toEqual(['cancel']);
  });

  it('commits an explicit tier choice before local confirmation', async () => {
    const runtime = setup(pickerSnapshot({
      capabilities: ['tiers'],
      selection: [{ id: 'seat-a', label: 'inventory-a', categoryKey: 'gold', tierId: 'adult', tiers: [{ id: 'adult', name: 'Adult', price: 42 }, { id: 'child', name: 'Child', price: 20 }] }] as never,
    }));
    const tree = await mount();
    await act(async () => { tree.root.findByProps({ accessibilityLabel: 'chooseChildTier' }).props.onPress(); });
    expect(texts(tree)).toContain('$20');
    await act(async () => { find(tree, 'seatLayerConfirmPrimary').props.onPress(); });
    expect(runtime.commands).toContainEqual(['tier', 'seat-a', 'child']);
    expect(runtime.counts().confirmed).toBe(1);
  });

  it('disables every action in a read-only scope without changing card ownership', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['seatView', 'venue3d'] }));
    runtime.setReadOnly(true);
    const tree = await mount();
    for (const node of tree.root.findAllByType('Pressable' as never)) {
      expect(node.props.disabled).toBe(true);
    }
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 0 });
  });

  it('keeps 44 pt of answer without defeating a host’s own radius', async () => {
    setup();
    const tree = await mount({
      style: { backgroundColor: '#123', height: 1 },
      slots: { confirmCardPrimaryButton: { backgroundColor: '#456', borderRadius: 1, height: 1, minHeight: 1 } },
    });
    const primary = find(tree, 'seatLayerConfirmPrimary');
    expect(primary.props.style.minHeight).toBe(seatLayerPickerTokens.size.minimumHitTarget);
    const paint = primary.findAllByType('View' as never)[0]!;
    const layers = [paint.props.style].flat(2);
    expect(layers[layers.length - 1]).toMatchObject({ backgroundColor: '#456', borderRadius: 1 });
    expect(layers[0]).toMatchObject({ height: seatLayerPickerTokens.size.confirmActionHeight });
  });

  it('owns no external media and follows the current theme', async () => {
    const runtime = setup();
    const tree = await mount();
    expect(tree.root.findAllByType('Image' as never)).toHaveLength(0);
    const surfaced = (color: string) => tree.root.findAllByType('View' as never).some((node) =>
      [node.props.style].flat(2).some((item: Record<string, unknown> | undefined) => item?.backgroundColor === color));
    expect(surfaced('#fff')).toBe(true);
    scope = { ...scope, resolvedTheme: { ...scope.resolvedTheme, colors: { ...scope.resolvedTheme.colors, surface: '#101010', text: '#f8f8f8' } } };
    await act(async () => { tree.update(React.createElement(SeatLayerConfirmCard)); });
    expect(surfaced('#101010')).toBe(true);
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 0 });
  });
});
