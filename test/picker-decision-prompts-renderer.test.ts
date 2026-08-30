import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  useSeatLayerPickerScope: () => scope,
  SeatLayerPickerScopeReprovider: ({ children }: { children?: React.ReactNode }) => children,
}));

import {
  SeatLayerPickerGAPrompt,
  SeatLayerPickerSeatTierSelector,
  SeatLayerPickerTablePrompt,
} from '../src/picker/SeatLayerPickerDecisionPrompts';
import { createSeatLayerPickerTableCandidate, createSeatLayerPickerTierCandidate } from '../src/picker/decisionPrompts';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';

function snapshot(overrides: Partial<SeatLayerPickerSnapshot> = {}): SeatLayerPickerSnapshot {
  return {
    schema: 'seatlayer.picker.snapshot/1', sessionId: 'session', revision: 1,
    event: { key: 'event', name: 'Event', mode: 'sale', currency: 'USD', salesClosed: false }, branding: { attributionRequired: false }, categories: [], zones: [], sections: [], bestAvailableZones: [],
    generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 3, currency: 'USD' }],
    map: { rung: 'overview', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'orbit', colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true, categoryFilter: [], accessibilityFilter: [], floors: [] },
    selection: [{ id: 'table', label: 'Table A', objectType: 'table', bookingMode: 'variable', minOccupancy: 2, maxOccupancy: 4, quantity: 2 }],
    maxSelection: 5, ticketCount: 0, cartLines: [], cartTotal: 0, currency: 'USD', hold: { active: false }, accessConfigured: true, accessStatus: 'available', capabilities: ['ga', 'tiers'], raw: null,
    ...overrides,
  };
}
function setup(value = snapshot()) {
  let currentSnapshot = value; let ga = Object.freeze({ areaId: 'ga', clickEpoch: 1 }); let prompt: any = null; let activeLease: any;
  const gaListeners = new Set<() => void>(); const commands: unknown[][] = []; let claims = 0;
  const publishPrompt = (nextPrompt: unknown) => {
    prompt = nextPrompt;
    scope = { ...scope, presentation: { ...scope.presentation, prompt: nextPrompt } };
  };
  const controller = {
    getSnapshot: () => currentSnapshot,
    getGACandidate: () => ga,
    subscribeGACandidate: (listener: () => void) => { gaListeners.add(listener); return () => gaListeners.delete(listener); },
    clearGACandidate: (epoch: number) => {
      if (ga?.clickEpoch !== epoch) return false;
      ga = undefined as never; for (const listener of gaListeners) listener(); return true;
    },
    mapController: {
      isReady: true,
      supportsPickerCapability: (value: string) => ['ga', 'tiers', 'table-quantity-v1', 'cart-line-remove-v1'].includes(value),
      supportsPickerCommand: (value: string) => ['picker.holdGA', 'picker.setTableQuantity', 'picker.setSeatTier', 'picker.removeCartLine'].includes(value),
      supportsPickerEvent: (value: string) => value === 'ga.click',
    },
    holdGA: async (...args: unknown[]) => { commands.push(args); },
    setTableQuantity: async (...args: unknown[]) => { commands.push(args); },
    removeCartLine: async (...args: unknown[]) => { commands.push(args); },
    setSeatTier: async (...args: unknown[]) => { commands.push(args); },
  };
  scope = {
    controller, snapshot: currentSnapshot, sessionId: 1, readOnly: false, isBusy: false,
    presentation: { prompt, sheet: 'collapsed', pendingConfirmation: null, focusedSection: null, isOverview: true },
    claimPrompt: (owner: string, kind: string, context: unknown) => {
      claims += 1;
      if (activeLease) return undefined;
      const lease = { owner, kind, context, epoch: 1 }; activeLease = lease;
      return { lease, open: () => { publishPrompt({ kind, context }); return true; }, dismiss: () => { if (activeLease !== lease) return false; activeLease = undefined; publishPrompt(null); return true; } };
    },
    back: async () => { activeLease = undefined; publishPrompt(null); return { type: 'dismissPrompt' }; },
    resolvedTheme: { colors: { onAccent: '#fff', text: '#111', accent: '#06f', divider: '#ccc', surface: '#fff', mutedText: '#555', error: '#b00' }, fontFamily: undefined },
    styles: {}, formatMoney: (amount: number, currency: string) => `${currency === 'USD' ? '$' : `${currency} `}${amount}`, strings: { translate: (key: string, options?: { values?: Record<string, unknown> }) => key === 'tierCompanionGuidance' ? 'Requires the adjacent wheelchair place.' : key === 'placesAvailable' ? `${options?.values?.count} places` : key },
  };
  return {
    controller, commands, setSnapshot: (next: SeatLayerPickerSnapshot) => { currentSnapshot = next; scope = { ...scope, snapshot: next }; },
    claims: () => claims,
    clearPrompt: () => { activeLease = undefined; publishPrompt(null); },
    setGA: (next: { areaId: string; clickEpoch: number } | undefined) => { ga = next as never; for (const listener of gaListeners) listener(); },
  };
}

describe('picker decision prompt renderer', () => {
  it('uses the typed GA store, claims one shared prompt lease, exposes adjustable quantity, and uses latest callbacks', async () => {
    const runtime = setup(); const calls: string[] = []; let renderer!: ReactTestRenderer;
    runtime.setGA({ areaId: 'ga', clickEpoch: 77 });
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt, { onDismiss: () => calls.push('dismiss'), onConfirm: () => calls.push('old') })); });
    expect(renderer.root.findAllByType('Modal' as any)).toHaveLength(1);
    expect(renderer.root.findAllByProps({ accessibilityRole: 'adjustable' })).toHaveLength(1);
    const adjustable = renderer.root.findByProps({ accessibilityRole: 'adjustable' });
    await act(async () => { adjustable.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); });
    expect(renderer.root.findByProps({ accessibilityRole: 'adjustable' }).props.accessibilityValue.now).toBe(2);
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerGAPrompt, { onDismiss: () => calls.push('dismiss'), onConfirm: () => calls.push('latest') })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'addTickets' }).props.onPress(); await Promise.resolve(); });
    expect(runtime.commands).toEqual([['ga', 2, {}]]);
    expect(calls).toEqual(['latest']);
  });

  it('lets the shared back ladder retire only its lease and blocks a competing table prompt', async () => {
    const runtime = setup(); const table = createSeatLayerPickerTableCandidate(scope as never, 'table', 2)!; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(React.Fragment, undefined, React.createElement(SeatLayerPickerGAPrompt), React.createElement(SeatLayerPickerTablePrompt, { candidate: table }))); });
    expect(renderer.root.findAllByType('Modal' as any)).toHaveLength(1);
    await act(async () => { await scope.back(); renderer.update(React.createElement(React.Fragment, undefined, React.createElement(SeatLayerPickerGAPrompt), React.createElement(SeatLayerPickerTablePrompt, { candidate: table }))); });
    expect(renderer.root.findAllByType('Modal' as any)).toHaveLength(1);
    expect(runtime.commands).toEqual([]);
  });

  it('does not let an old GA flight clear a newer typed click epoch', async () => {
    const runtime = setup(); const observations: string[] = []; let resolve!: () => void;
    runtime.controller.holdGA = () => new Promise<void>((done) => { resolve = done; });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt, { onDismiss: () => observations.push('dismiss'), onConfirm: () => observations.push('confirm') })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'addTickets' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { runtime.setGA({ areaId: 'ga', clickEpoch: 2 }); });
    resolve();
    await act(async () => { await Promise.resolve(); });
    expect(runtime.controller.getGACandidate()).toMatchObject({ clickEpoch: 2 });
    expect(observations).toEqual([]);
  });

  it('does not send a stale rendered GA confirmation after the typed click store advances', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt)); });
    const staleConfirm = renderer.root.findByProps({ accessibilityLabel: 'addTickets' }).props.onPress;
    await act(async () => { runtime.setGA({ areaId: 'ga', clickEpoch: 2 }); });
    await act(async () => { staleConfirm(); await Promise.resolve(); });
    expect(runtime.commands).toEqual([]);
  });

  it('resets GA quantity and tier only for a genuinely new typed click epoch', async () => {
    const runtime = setup(snapshot({ generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 4, tiers: [
      { id: 'adult', name: 'Adult', price: 20 }, { id: 'child', name: 'Child', price: 10 },
    ] }] })); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt)); });
    await act(async () => { renderer.root.findByProps({ accessibilityRole: 'adjustable' }).props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); });
    expect(renderer.root.findByProps({ accessibilityRole: 'adjustable' }).props.accessibilityValue.now).toBe(2);
    await act(async () => { runtime.setGA({ areaId: 'ga', clickEpoch: 2 }); await Promise.resolve(); });
    expect(renderer.root.findByProps({ accessibilityRole: 'adjustable' }).props.accessibilityValue.now).toBe(1);
  });

  it('reprojects a removed GA tier before confirmation can use the default tier', async () => {
    const runtime = setup(snapshot({ generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 4, tiers: [
      { id: 'adult', name: 'Adult', price: 20 }, { id: 'child', name: 'Child', price: 10 },
    ] }] })); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt)); });
    await act(async () => { renderer.root.findAllByProps({ accessibilityRole: 'radio' })[1]!.props.onPress(); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })[1]!.props.accessibilityState.checked).toBe(true);
    runtime.setSnapshot(snapshot({ revision: 2, generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 4, tiers: [{ id: 'adult', name: 'Adult', price: 20 }] }] }));
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerGAPrompt)); await Promise.resolve(); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })[0]!.props.accessibilityState.checked).toBe(true);
    expect(renderer.root.findByProps({ accessibilityLabel: 'addTickets' }).props.accessibilityState.disabled).toBe(false);
  });

  it('reports a successful command once even if its prompt lease is concurrently lost', async () => {
    const runtime = setup(); const calls: string[] = []; let resolve!: () => void; let renderer!: ReactTestRenderer;
    runtime.controller.holdGA = () => new Promise<void>((done) => { resolve = done; });
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt, { onDismiss: () => calls.push('dismiss'), onConfirm: () => calls.push('confirm') })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'addTickets' }).props.onPress(); await Promise.resolve(); });
    runtime.clearPrompt(); resolve();
    await act(async () => { await Promise.resolve(); });
    expect(calls).toEqual(['confirm']);
  });

  it('quarantines synchronous and asynchronous observer failures without changing a decision', async () => {
    const runtime = setup(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt, {
      onConfirm: () => Promise.reject(new Error('observer rejection')),
    })); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'addTickets' }).props.onPress(); await Promise.resolve(); });
    expect(runtime.commands).toEqual([['ga', 1, {}]]);

    setup();
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt, { onDismiss: () => Promise.reject(new Error('dismiss rejection')) })); });
    await act(async () => { await scope.back(); await Promise.resolve(); });

    const tierValue = snapshot({ selection: [{ id: 'seat', label: 'A-1', tiers: [
      { id: 'adult', name: 'Adult', price: 20 }, { id: 'child', name: 'Child', price: 10 },
    ], tierId: 'adult' }] });
    setup(tierValue); const candidate = createSeatLayerPickerTierCandidate(scope as never, 'seat', 1)!;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatTierSelector, { candidate, onValueChange: () => Promise.reject(new Error('tier rejection')) })); });
    await act(async () => { renderer.root.findAllByProps({ accessibilityRole: 'radio' })[1]!.props.onPress(); await Promise.resolve(); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })[1]!.props.accessibilityState.checked).toBe(true);
  });

  it('latches a dismissed controlled table candidate until a genuinely new epoch arrives', async () => {
    setup(); const first = createSeatLayerPickerTableCandidate(scope as never, 'table', 1)!; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerTablePrompt, { candidate: first })); });
    expect(renderer.root.findAllByType('Modal' as any)).toHaveLength(1);
    await act(async () => { await scope.back(); renderer.update(React.createElement(SeatLayerPickerTablePrompt, { candidate: first })); });
    expect(renderer.root.findAllByType('Modal' as any)).toHaveLength(0);
    const next = createSeatLayerPickerTableCandidate(scope as never, 'table', 2)!;
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerTablePrompt, { candidate: next })); });
    expect(renderer.root.findAllByType('Modal' as any)).toHaveLength(1);
  });

  it('does not claim an invisible table prompt for a current tier candidate', async () => {
    const value = snapshot({ selection: [{ id: 'seat', label: 'A-1', tiers: [{ id: 'adult', name: 'Adult', price: 20 }], tierId: 'adult' }] });
    const runtime = setup(value); const tier = createSeatLayerPickerTierCandidate(scope as never, 'seat', 1)!; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerTablePrompt, { candidate: tier })); });
    expect(renderer.root.findAllByType('Modal' as any)).toHaveLength(0);
    expect(runtime.claims()).toBe(0);
  });

  it('retires a same-epoch table replacement before its stale action can commit', async () => {
    const value = snapshot({ selection: [
      { id: 'table', label: 'Table A', objectType: 'table', bookingMode: 'variable', minOccupancy: 2, maxOccupancy: 4, quantity: 2 },
      { id: 'table-b', label: 'Table B', objectType: 'table', bookingMode: 'variable', minOccupancy: 2, maxOccupancy: 4, quantity: 2 },
    ] });
    const runtime = setup(value); const first = createSeatLayerPickerTableCandidate(scope as never, 'table', 1)!;
    const replacement = createSeatLayerPickerTableCandidate(scope as never, 'table-b', 1)!; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerTablePrompt, { candidate: first })); });
    const staleConfirm = renderer.root.findByProps({ accessibilityLabel: 'confirmTable' }).props.onPress;
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerTablePrompt, { candidate: replacement })); await Promise.resolve(); });
    await act(async () => { staleConfirm(); await Promise.resolve(); });
    expect(runtime.commands).toEqual([]);
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'confirmTable' }).props.onPress(); await Promise.resolve(); });
    expect(runtime.commands).toEqual([['Table B', 2]]);
  });

  it('renders buyer guidance first and generated companion guidance only when needed without another Select action', async () => {
    const value = snapshot({
      selection: [{ id: 'seat', label: 'A-1', tiers: [
        { id: 'adult', name: 'Adult', price: 20, buyerMessage: 'Buyer guidance' },
        { id: 'companion', name: 'Companion', price: 10, restriction: 'companion' },
        { id: 'companion-note', name: 'Priority companion', price: 10, restriction: 'companion', buyerMessage: 'Specific companion guidance' },
      ], tierId: 'adult' }],
    });
    setup(value);
    const candidate = createSeatLayerPickerTierCandidate(scope as never, 'seat', 1)!; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatTierSelector, { candidate })); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(3);
    expect(renderer.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toContain('Buyer guidance');
    expect(renderer.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toContain('Requires the adjacent wheelchair place.');
    const buyerSpecific = renderer.root.findAllByProps({ accessibilityRole: 'radio' }).find((node) => node.props.accessibilityLabel.includes('Priority companion'));
    expect(buyerSpecific!.props.accessibilityLabel).toContain('Specific companion guidance');
    expect(buyerSpecific!.props.accessibilityLabel).not.toContain('Requires the adjacent wheelchair place.');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'select' })).toHaveLength(0);
  });

  it('keeps guidance visible for a single tier without rendering a redundant choice', async () => {
    const value = snapshot({ selection: [{ id: 'seat', label: 'A-1', tiers: [{ id: 'only', name: 'Only', price: 20, buyerMessage: 'Single guidance' }], tierId: 'only' }] });
    setup(value); const candidate = createSeatLayerPickerTierCandidate(scope as never, 'seat', 1)!; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatTierSelector, { candidate })); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(0);
    expect(renderer.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toContain('Single guidance');
  });

  it('keeps long GA tier choices in a bounded scroll surface', async () => {
    const tiers = Array.from({ length: 12 }, (_, index) => ({ id: `tier-${index}`, name: `Tier ${index}`, price: index + 1 }));
    setup(snapshot({ generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 12, tiers }] })); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt)); });
    expect(renderer.root.findAllByType('ScrollView' as any)).toHaveLength(1);
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(12);
  });

  it('does not leave a blank tier scroll surface for a no-tier GA decision', async () => {
    setup(snapshot({ generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 3 }] })); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerGAPrompt)); });
    expect(renderer.root.findAllByType('ScrollView' as any)).toHaveLength(0);
  });

  it('resyncs uncontrolled tier choice for an authoritative same-candidate tier change without clobbering unrelated local choices', async () => {
    const tiers = [
      { id: 'adult', name: 'Adult', price: 20 },
      { id: 'child', name: 'Child', price: 10 },
      { id: 'senior', name: 'Senior', price: 15 },
    ];
    const initial = snapshot({ selection: [{ id: 'seat', label: 'A-1', tiers, tierId: 'adult' }] });
    const runtime = setup(initial); const candidate = createSeatLayerPickerTierCandidate(scope as never, 'seat', 1)!; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerSeatTierSelector, { candidate })); });
    await act(async () => { renderer.root.findAllByProps({ accessibilityRole: 'radio' })[1]!.props.onPress(); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })[1]!.props.accessibilityState.checked).toBe(true);
    runtime.setSnapshot(snapshot({ revision: 2, selection: [{ id: 'seat', label: 'A-1', tiers, tierId: 'senior' }] }));
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSeatTierSelector, { candidate })); await Promise.resolve(); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })[2]!.props.accessibilityState.checked).toBe(true);
    await act(async () => { renderer.root.findAllByProps({ accessibilityRole: 'radio' })[0]!.props.onPress(); });
    runtime.setSnapshot(snapshot({ revision: 3, selection: [{ id: 'seat', label: 'A-1', tiers, tierId: 'senior' }] }));
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerSeatTierSelector, { candidate })); await Promise.resolve(); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })[0]!.props.accessibilityState.checked).toBe(true);
  });

  it('does not issue a table override when the live scope is no longer writable', async () => {
    setup(); const candidate = createSeatLayerPickerTableCandidate(scope as never, 'table', 1)!; let removed = 0; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerTablePrompt, { candidate, onRemoveTable: async () => { removed += 1; } })); });
    scope.readOnly = true;
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'removeSeat' }).props.onPress(); await Promise.resolve(); });
    expect(removed).toBe(0);
  });
});
