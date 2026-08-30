import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  useWindowDimensions: () => ({ width: 1200, height: 900 }), StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
}));
let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));
vi.mock('../src/picker/SeatLayerPickerDecisionPrompts', async (importActual) => ({
  ...(await importActual<typeof import('../src/picker/SeatLayerPickerDecisionPrompts')>()),
  SeatLayerPickerSeatTierSelector: ({ onValueChange }: { onValueChange?: (value: string) => void }) => React.createElement('Pressable', { accessibilityLabel: 'chooseChildTier', onPress: () => onValueChange?.('child') }),
}));

import { SeatLayerPickerSeatConfirmation } from '../src/picker/SeatLayerPickerSeatConfirmation';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';

function snapshot(): SeatLayerPickerSnapshot {
  return {
    schema: 'seatlayer.picker.snapshot/1', sessionId: 'runtime', revision: 1,
    event: { key: 'event', name: 'Event', mode: 'sale', currency: 'USD', salesClosed: false }, branding: { attributionRequired: false },
    categories: [{ key: 'adult', label: 'Adult', color: '#0a6', priceMin: 40, priceMax: 40, available: 2, notForSale: false, tiers: [] }], zones: [], sections: [], bestAvailableZones: [], generalAdmissionAreas: [],
    map: { rung: 'overview', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'orbit', colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true, categoryFilter: [], accessibilityFilter: [], floors: [] },
    selection: [{ id: 'seat-a', label: 'inventory-a', objectType: 'seat', categoryKey: 'adult', sectionLabel: 'Orchestra', rowLabel: 'A', displayType: 'Row', seatNumber: '12', price: 40, currency: 'USD', tierId: 'adult', tiers: [{ id: 'adult', name: 'Adult', price: 40 }, { id: 'child', name: 'Child', price: 20, buyerMessage: 'Buyer message' }], commercial: { restrictedView: true, note: 'Obstructed stage edge' }, accessibility: ['wheelchair'], wheelchairSpaceType: 'no-seat' }],
    maxSelection: 4, ticketCount: 1, cartLines: [], cartTotal: 40, currency: 'USD', hold: { active: false }, accessConfigured: true, accessStatus: 'available', capabilities: ['tiers', 'seatView', 'venue3d'], raw: null,
  };
}
function setup(options: Readonly<{ categoryColor?: unknown; section?: string; commercialNote?: string; wheelchairSpaceType?: string; objectType?: string }> = {}) {
  let current = snapshot();
  current = {
    ...current,
    categories: [{ ...current.categories[0]!, ...(options.categoryColor === undefined ? {} : { color: options.categoryColor as string }) }],
    selection: [{ ...current.selection[0]!, ...(options.section === undefined ? {} : { sectionLabel: options.section }), commercial: { restrictedView: true, ...(options.commercialNote === undefined ? { note: 'Obstructed stage edge' } : options.commercialNote ? { note: options.commercialNote } : {}) }, ...(options.wheelchairSpaceType === undefined ? {} : { wheelchairSpaceType: options.wheelchairSpaceType }), ...(options.objectType === undefined ? {} : { objectType: options.objectType }) }],
  };
  let pending: (typeof current.selection)[number] | undefined = current.selection[0]; const calls: unknown[][] = []; let confirmed = 0;
  const controller: any = {
    getSnapshot: () => current,
    mapController: { isReady: true, supportsPickerCapability: () => true, supportsPickerCommand: () => true, supportsPickerEvent: () => true },
    get supportsSeatView() { return true; }, get supportsVenue3D() { return true; }, get supportsNativeSeatViewChrome() { return false; },
    setSeatTier: async (...args: unknown[]) => { calls.push(['tier', ...args]); }, openSeatView: async (id: string) => { calls.push(['seatView', id]); }, setBuyerView: async (...args: unknown[]) => { calls.push(['venue3d', ...args]); }, getSeatView: () => undefined, subscribeSeatView: () => () => {},
  };
  const publish = () => { scope = { controller, snapshot: current, pendingSeat: pending, sessionId: 1, isBusy: false, readOnly: false, confirmPending: () => { confirmed += 1; pending = undefined; }, cancelPending: async () => { pending = undefined; return true; }, reportError: () => {}, styles: {}, formatMoney: (amount: number, currency: string) => `${currency === 'USD' ? '$' : `${currency} `}${amount}`, strings: { translate: (key: string) => key, accessNeed: (need: string) => `access:${need}` }, resolvedTheme: { colors: { surface: '#fff', divider: '#ccc', accent: '#06f', text: '#111', onAccent: '#fff', mutedText: '#555', warning: '#c80' }, fontFamily: 'Brand' } }; };
  publish();
  return { calls, counts: () => confirmed, replace: () => { scope = { ...scope, controller: { ...controller } }; } };
}

describe('SeatLayerPickerSeatConfirmation', () => {
  it('renders the wide identity grid, price, truthful notices, tiers, and gated inspection actions', async () => {
    setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatConfirmation)); });
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain('Orchestra');
    expect(text).toContain('Adult');
    expect(text).toContain('$40');
    expect(text).toContain('Obstructed stage edge');
    expect(renderer.root.findByProps({ accessibilityLabel: 'viewFromHere' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'venue3D' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'chooseChildTier' })).toBeTruthy();
  });

  it('commits the selected tier before the shared Select action and observes the same action shape', async () => {
    const runtime = setup(); const observed: unknown[] = []; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatConfirmation, { onAction: (event) => { observed.push(event); } })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'chooseChildTier' }).props.onPress(); });
    expect(renderer.root.findAllByType('Text' as any).some((node) => node.children.join('') === '$20')).toBe(true);
    expect(renderer.root.findAllByType('Text' as any).some((node) => node.children.join('') === '$40')).toBe(false);
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'select' }).props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(runtime.calls).toEqual([['tier', 'seat-a', 'child']]);
    expect(runtime.counts()).toBe(1);
    expect(observed).toMatchObject([{ action: 'confirm', seat: { id: 'seat-a' } }]);
  });

  it('makes a retained wide action inert after controller replacement', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatConfirmation)); });
    const stale = renderer.root.findByProps({ accessibilityLabel: 'cancel' }).props.onPress;
    runtime.replace();
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSeatConfirmation)); stale(); });
    expect(runtime.counts()).toBe(0);
  });

  it('does not expose raw object, wheelchair, or duplicate-section wire data in the identity', async () => {
    setup({ wheelchairSpaceType: 'wire-wheelchair-space' }); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatConfirmation)); });
    const text = JSON.stringify(renderer.toJSON());
    expect(text).not.toContain('"seat"');
    expect(text).not.toContain('wire-wheelchair-space');
    expect(renderer.root.findAllByType('Text' as any).filter((node) => node.children.join('') === 'Orchestra')).toHaveLength(1);
    expect(text).toContain('access:wheelchair');
  });

  it('uses a safe category-colour fallback and buyer-authored restricted note only', async () => {
    setup({ categoryColor: '#not-a-colour' as unknown as string, commercialNote: '' }); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatConfirmation)); });
    const text = JSON.stringify(renderer.toJSON());
    expect(text).not.toContain('#not-a-colour');
    expect(text).not.toContain('hideLimitedView');
    expect(renderer.root.findAllByType('View' as any).some((node) =>
      Array.isArray(node.props.style) && node.props.style.some((item: Record<string, unknown>) => item?.width === 10 && item?.height === 10 && item?.borderRadius === 5) &&
        node.props.style.some((item: Record<string, unknown>) => item?.backgroundColor === '#c80'),
    )).toBe(false);
    expect(renderer.root.findAllByType('View' as any).some((node) =>
      Array.isArray(node.props.style) && node.props.style.some((item: Record<string, unknown>) => item?.backgroundColor === 'rgba(0, 102, 255, 1)'),
    )).toBe(true);
  });

  it('does not turn a raw booth wire enum into buyer-facing identity copy', async () => {
    setup({ objectType: 'booth' }); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatConfirmation)); });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('"booth"');
  });

  it('bounds scrolling and stacks inspection actions from parent width rather than window width', async () => {
    setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatConfirmation)); });
    expect(renderer.root.findByType('ScrollView' as any)).toBeTruthy();
    const layout = renderer.root.findAllByType('View' as any).find((node) => typeof node.props.onLayout === 'function');
    expect(layout?.props.style[1]).toMatchObject({ maxHeight: 648 });
    await act(async () => { layout?.props.onLayout({ nativeEvent: { layout: { width: 320 } } }); });
    const inspection = renderer.root.findByProps({ testID: 'seatConfirmationInspection' });
    expect(inspection.props.style[1]).toMatchObject({ flexDirection: 'column' });
  });
});
