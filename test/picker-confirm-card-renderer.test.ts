import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Pressable: 'Pressable', Text: 'Text', View: 'View',
  useWindowDimensions: () => ({ width: 392, height: 844 }),
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));
vi.mock('../src/picker/SeatLayerPickerDecisionPrompts', () => ({
  SeatLayerPickerSeatTierSelector: ({ onValueChange }: { onValueChange?: (value: string) => void }) =>
    React.createElement('Pressable', { accessibilityLabel: 'chooseChildTier', onPress: () => onValueChange?.('child') }),
}));

import { SeatLayerConfirmCard } from '../src/picker/SeatLayerConfirmCard';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';

function pickerSnapshot(overrides: Partial<SeatLayerPickerSnapshot> = {}): SeatLayerPickerSnapshot {
  return {
    schema: 'seatlayer.picker.snapshot/1', sessionId: 'runtime', revision: 1,
    event: { key: 'event', name: 'Event', mode: 'sale', currency: 'USD', salesClosed: false }, branding: { attributionRequired: false },
    categories: [], zones: [], sections: [{ id: 'orchestra', label: 'Orchestra' }], bestAvailableZones: [], generalAdmissionAreas: [],
    map: { rung: 'overview', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'orbit', colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true, categoryFilter: [], accessibilityFilter: [], floors: [] },
    selection: [{ id: 'seat-a', label: 'inventory-a', sectionLabel: 'Orchestra', rowLabel: 'A', seatNumber: '12', price: 42, currency: 'USD' }],
    maxSelection: 4, ticketCount: 1, cartLines: [], cartTotal: 42, currency: 'USD', hold: { active: false }, accessConfigured: true, accessStatus: 'available', capabilities: [], raw: null,
    ...overrides,
  };
}

function setup(snapshot = pickerSnapshot()) {
  let current = snapshot; let pending = snapshot.selection[0]; const commands: unknown[][] = []; const errors: unknown[] = [];
  let confirmed = 0; let cancelled = 0; let readOnly = false; let nativeSeatChrome = false;
  let seatView: { seatId?: string } | undefined; const seatViewListeners = new Set<() => void>();
  const controller = {
    getSnapshot: () => current,
    mapController: {
      isReady: true,
      supportsPickerCapability: (value: string) => ['tiers', 'seat-view-v1', 'venue-3d-v1'].includes(value),
      supportsPickerCommand: (value: string) => ['picker.setSeatTier', 'picker.openSeatView', 'picker.setBuyerView'].includes(value),
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
      confirmPending: () => { confirmed += 1; pending = null as never; },
      cancelPending: async () => { if (!pending || pending.id !== current.selection[0]?.id) return false; cancelled += 1; pending = null as never; return true; },
      reportError: (error: unknown) => errors.push(error), styles: {}, formatMoney: (amount: number, currency: string) => `${currency === 'USD' ? '$' : `${currency} `}${amount}`,
      strings: { translate: (key: string, options?: { values?: Record<string, string> }) => {
        if (key === 'rowIdentity') return `Row ${options?.values?.row}`;
        if (key === 'seatNumberIdentity') return `Seat ${options?.values?.seat}`;
        if (key === 'seatIdentity') return options?.values?.parts ?? '';
        return key;
      } },
      resolvedTheme: { colors: { surface: '#fff', divider: '#ccc', accent: '#06f', text: '#111', onAccent: '#fff' }, fontFamily: 'Brand' },
    };
  };
  publishScope();
  return {
    commands, errors, controller, counts: () => ({ confirmed, cancelled }),
    update: (next: SeatLayerPickerSnapshot, nextPending = next.selection[0]) => { current = next; pending = nextPending; publishScope(); },
    replaceController: () => { scope = { ...scope, controller: { ...controller } }; },
    setReadOnly: (next: boolean) => { readOnly = next; publishScope(); },
    setNativeSeatChrome: (next: boolean) => { nativeSeatChrome = next; },
    setVenueTarget: (id: string | undefined) => { current = { ...current, map: { ...current.map, buyerView: 'venue3d', view3DTargetSeatId: id } }; publishScope(); },
    mountSeatView: (id?: string) => { seatView = id === undefined ? undefined : { seatId: id }; for (const listener of seatViewListeners) listener(); },
  };
}

describe('SeatLayerConfirmCard', () => {
  it('renders only the exact selected non-variable pending seat and Select confirms locally', async () => {
    const runtime = setup(); const observed: any[] = []; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, { onAction: (event) => { observed.push(event); } })); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'select' })).toBeTruthy();
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'select' }).props.onPress(); });
    expect(runtime.counts()).toEqual({ confirmed: 1, cancelled: 0 });
    expect(runtime.commands).toEqual([]);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({ action: 'confirm', seat: { id: 'seat-a', label: 'inventory-a' } });
    expect(Object.isFrozen(observed[0].seat)).toBe(true);

    runtime.update(pickerSnapshot({ selection: [{ id: 'table', label: 'table', objectType: 'table', bookingMode: 'variable' }] }));
    await act(async () => { renderer.update(React.createElement(SeatLayerConfirmCard)); });
    expect(renderer.toJSON()).toBeNull();
  });

  it('keeps the compact identity announcements and truncation contract', async () => {
    setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard)); });
    const identity = renderer.root.findByProps({ accessibilityRole: 'header' });
    const price = renderer.root.findAllByType('Text' as any).find((node) => node.children.join('') === '$42');
    expect(identity.props).toMatchObject({ accessibilityLiveRegion: 'polite', ellipsizeMode: 'tail', numberOfLines: 1 });
    expect(price?.props).toMatchObject({ ellipsizeMode: 'clip', numberOfLines: 1 });
  });

  it('does not inspect a recycled id and label when its current section differs', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['seatView'] })); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard)); });
    const retained = renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress;
    runtime.update(pickerSnapshot({ capabilities: ['seatView'], selection: [{ id: 'seat-a', label: 'inventory-a', sectionLabel: 'Mezzanine', rowLabel: 'A', seatNumber: '12' }] }));
    await act(async () => { renderer.update(React.createElement(SeatLayerConfirmCard)); retained(); });
    expect(runtime.commands).toEqual([]);
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 0 });
  });

  it('sets its flight token before a reentrant Select observer can invoke the retained press', async () => {
    const runtime = setup(); const observed: string[] = []; let select!: () => void; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, {
      onAction: ({ action }) => { observed.push(action); select(); },
    })); });
    select = renderer.root.findByProps({ accessibilityLabel: 'select' }).props.onPress;
    await act(async () => { select(); });
    expect(runtime.counts()).toEqual({ confirmed: 1, cancelled: 0 });
    expect(observed).toEqual(['confirm']);
  });

  it('uses exact cancellation and makes a retained press inert after an identical-session controller replacement', async () => {
    const runtime = setup(); const observed: string[] = []; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, { onAction: ({ action }) => { observed.push(action); } })); });
    const staleCancel = renderer.root.findByProps({ accessibilityLabel: 'cancel' }).props.onPress;
    runtime.replaceController();
    await act(async () => { renderer.update(React.createElement(SeatLayerConfirmCard, { onAction: ({ action }) => { observed.push(action); } })); });
    await act(async () => { staleCancel(); });
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 0 });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'cancel' }).props.onPress(); });
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 1 });
    expect(observed).toEqual(['cancel']);
  });

  it('quarantines an old completion callback when local confirmation exposes a different pending item', async () => {
    const runtime = setup(); const observed: string[] = [];
    const replacement = pickerSnapshot({ selection: [{ id: 'seat-b', label: 'inventory-b', price: 20 }] });
    scope.confirmPending = () => { scope.snapshot = replacement; scope.pendingSeat = replacement.selection[0]; };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, { onAction: ({ action }) => { observed.push(action); } })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'select' }).props.onPress(); await Promise.resolve(); });
    expect(observed).toEqual([]);
    expect(runtime.commands).toEqual([]);
  });

  it('commits an explicit tier choice before local confirmation and resets the card on replacement', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['tiers'], selection: [{ id: 'seat-a', label: 'inventory-a', tierId: 'adult', tiers: [{ id: 'adult', name: 'Adult', price: 42 }, { id: 'child', name: 'Child', price: 20 }] }] }));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'chooseChildTier' }).props.onPress(); });
    expect(renderer.root.findAllByType('Text' as any).some((node) => node.children.join('') === '$20')).toBe(true);
    expect(renderer.root.findAllByType('Text' as any).some((node) => node.children.join('') === '$42')).toBe(false);
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'select' }).props.onPress(); });
    expect(runtime.commands).toEqual([['tier', 'seat-a', 'child']]);
    expect(runtime.counts().confirmed).toBe(1);
  });

  it('gates inspection actions, keeps the candidate pending, and restores it after Seat View closes', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['seatView', 'venue3d'] })); const observed: string[] = []; let renderer!: ReactTestRenderer;
    runtime.setNativeSeatChrome(true);
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, { onAction: ({ action }) => { observed.push(action); } })); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' })).toBeTruthy();
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress(); });
    expect(runtime.counts().confirmed).toBe(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'select' }).props.accessibilityState.busy).toBe(true);
    await act(async () => { runtime.mountSeatView('seat-a'); });
    expect(runtime.counts().confirmed).toBe(0);
    expect(renderer.toJSON()).toBeNull();
    expect(observed).toEqual(['seatView']);
    await act(async () => { runtime.mountSeatView(); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'select' })).toBeTruthy();
    expect(runtime.counts().confirmed).toBe(0);
  });

  it('keeps a command-only Seat View candidate pending without exposing it in the cart', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['seatView'] })); const observed: string[] = []; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, { onAction: ({ action }) => { observed.push(action); } })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress(); });
    expect(runtime.commands).toEqual([['seatView', 'seat-a']]);
    expect(runtime.counts().confirmed).toBe(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'select' })).toBeTruthy();
    expect(observed).toEqual(['seatView']);
  });

  it('requires the exact Venue 3D target while keeping inspection pending', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['venue3d'] })); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard)); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'venue3D' }).props.onPress(); });
    expect(runtime.counts().confirmed).toBe(0);
    expect(runtime.errors).toHaveLength(1);
    runtime.controller.setBuyerView = async () => { runtime.setVenueTarget('seat-a'); };
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'venue3D' }).props.onPress(); });
    expect(runtime.counts().confirmed).toBe(0);
    await act(async () => { renderer.update(React.createElement(SeatLayerConfirmCard)); });
    expect(renderer.toJSON()).toBeNull();
    await act(async () => {
      runtime.update(pickerSnapshot({ capabilities: ['venue3d'] }));
      renderer.update(React.createElement(SeatLayerConfirmCard));
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'select' })).toBeTruthy();
  });

  it('quarantines a retired in-flight inspection completion, error, and observer callback', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['seatView'] })); let reject!: (error: Error) => void; const observed: string[] = [];
    runtime.controller.openSeatView = () => new Promise<void>((_, fail) => { reject = fail; });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, { onAction: ({ action }) => { observed.push(action); } })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress(); });
    runtime.replaceController();
    await act(async () => { renderer.update(React.createElement(SeatLayerConfirmCard, { onAction: ({ action }) => { observed.push(action); } })); });
    await act(async () => { reject(new Error('retired')); });
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 0 });
    expect(runtime.errors).toEqual([]);
    expect(observed).toEqual([]);
  });

  it('disables every action in a read-only scope without changing card ownership', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['seatView', 'venue3d'] })); runtime.setReadOnly(true); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard)); });
    expect(renderer.root.findAllByType('Pressable' as any).every((node) =>
      node.props.accessibilityState.disabled === true && node.props.disabled === true,
    )).toBe(true);
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 0 });
  });

  it('keeps an inspection failure visible, contains its error, and protects 44/40 geometry without defeating host radius', async () => {
    const runtime = setup(pickerSnapshot({ capabilities: ['seatView'] })); runtime.controller.openSeatView = async () => { throw new Error('native failure'); };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard, { style: { backgroundColor: '#123', height: 1 }, slots: { confirmCardPrimaryButton: { backgroundColor: '#456', borderRadius: 1, height: 1, minHeight: 1 } } })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' }).props.onPress(); });
    expect(runtime.counts().confirmed).toBe(0);
    expect(runtime.errors).toHaveLength(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'select' })).toBeTruthy();
    const primary = renderer.root.findByProps({ accessibilityLabel: 'select' });
    expect(primary.props.style.minHeight).toBe(44);
    const paint = primary.findByType('View' as any);
    expect(paint.props.style[paint.props.style.length - 1]).toMatchObject({ backgroundColor: '#456', borderRadius: 1 });
    expect(paint.props.style[paint.props.style.length - 1]).not.toHaveProperty('height');
    expect(paint.props.style[paint.props.style.length - 1]).not.toHaveProperty('minHeight');
    expect(paint.props.style[0]).toMatchObject({ height: 40 });
  });

  it('keeps a long generated identity to one line, owns no external media, and follows the current theme', async () => {
    const runtime = setup(pickerSnapshot({ selection: [{ id: 'long', label: 'inventory-long', sectionLabel: 'A very long authored section', rowLabel: 'Row 999999', seatNumber: 'A buyer-facing seat number that must truncate', price: 42 }] }));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerConfirmCard)); });
    const header = renderer.root.findByProps({ accessibilityRole: 'header' });
    expect(header.props.numberOfLines).toBe(1);
    expect(renderer.root.findAllByType('Image' as any)).toHaveLength(0);
    expect(renderer.root.findAllByType('View' as any).some((node) =>
      Array.isArray(node.props.style) && node.props.style.some((item: Record<string, unknown>) => item?.backgroundColor === '#fff'),
    )).toBe(true);

    scope = { ...scope, resolvedTheme: { ...scope.resolvedTheme, colors: { ...scope.resolvedTheme.colors, surface: '#101010', text: '#f8f8f8' } } };
    await act(async () => { renderer.update(React.createElement(SeatLayerConfirmCard)); });
    expect(renderer.root.findAllByType('View' as any).some((node) =>
      Array.isArray(node.props.style) && node.props.style.some((item: Record<string, unknown>) => item?.backgroundColor === '#101010'),
    )).toBe(true);
    expect(runtime.counts()).toEqual({ confirmed: 0, cancelled: 0 });
  });
});
