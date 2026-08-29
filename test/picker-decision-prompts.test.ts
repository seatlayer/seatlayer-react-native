import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: { flatten: (value: unknown) => value },
}));

import type { SeatLayerPickerController } from '../src/picker/controller';
import {
  SeatLayerPickerDecisionCoordinator,
  createSeatLayerPickerGACandidate,
  createSeatLayerPickerTableCandidate,
  createSeatLayerPickerTierCandidate,
  projectSeatLayerPickerDecision,
  type SeatLayerPickerDecisionScope,
} from '../src/picker/decisionPrompts';
import {
  normalizeSeatLayerPickerDecisionPromptInsets,
} from '../src/picker/decisionPromptInputs';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';
import { sanitizeSeatLayerPickerStyle } from '../src/picker/styles';

function snapshot(overrides: Partial<SeatLayerPickerSnapshot> = {}): SeatLayerPickerSnapshot {
  return {
    schema: 'seatlayer.picker.snapshot/1', sessionId: 'session', revision: 1,
    event: { key: 'event', name: 'Event', mode: 'sale', currency: 'USD', salesClosed: false }, branding: { attributionRequired: false }, categories: [], zones: [], sections: [], bestAvailableZones: [],
    generalAdmissionAreas: [{ id: 'ga', label: 'General admission', available: 3, currency: 'USD' }],
    map: { rung: 'overview', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'orbit', colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true, categoryFilter: [], accessibilityFilter: [], floors: [] },
    selection: [
      { id: 'table', label: 'Table A', objectType: 'table', bookingMode: 'variable', quantity: 3, minOccupancy: 2, maxOccupancy: 6 },
      { id: 'seat', label: 'A-1', tiers: [{ id: 'adult', name: 'Adult', price: 20 }, { id: 'child', name: 'Child', price: 10 }], tierId: 'adult' },
    ],
    maxSelection: 5, ticketCount: 2, cartLines: [], cartTotal: 0, currency: 'USD', hold: { active: false }, accessConfigured: true, accessStatus: 'available', capabilities: ['ga', 'tiers'], raw: null,
    ...overrides,
  };
}
function controller(
  getSnapshot: () => SeatLayerPickerSnapshot | undefined,
  capabilities = ['ga', 'tiers', 'table-quantity-v1', 'cart-line-remove-v1'],
  commands = ['picker.holdGA', 'picker.setTableQuantity', 'picker.setSeatTier', 'picker.removeCartLine'],
  events = ['ga.click'],
): SeatLayerPickerController {
  let candidate = Object.freeze({ areaId: 'ga', clickEpoch: 1 });
  return {
    getSnapshot,
    getGACandidate: () => candidate,
    mapController: {
      isReady: true,
      supportsPickerCapability: (value: string) => capabilities.includes(value),
      supportsPickerCommand: (value: string) => commands.includes(value),
      supportsPickerEvent: (value: string) => events.includes(value),
    },
    holdGA: async () => undefined,
    setTableQuantity: async () => undefined,
    setSeatTier: async () => undefined,
    removeCartLine: async () => undefined,
  } as unknown as SeatLayerPickerController;
}
function setGACandidate(controller: SeatLayerPickerController, clickEpoch: number, areaId = 'ga'): void {
  (controller.getGACandidate as unknown as () => unknown) = () => Object.freeze({ areaId, clickEpoch });
}
function scope(snapshotValue = snapshot()): SeatLayerPickerDecisionScope {
  let live = snapshotValue;
  const value = {
    snapshot: live, sessionId: 1, readOnly: false, isBusy: false,
    controller: undefined as unknown as SeatLayerPickerController,
  };
  value.controller = controller(() => live);
  Object.defineProperty(value, 'setLive', { value: (next: SeatLayerPickerSnapshot) => { live = next; value.snapshot = next; } });
  return value;
}

describe('picker decision coordinator', () => {
  it('keeps GA display availability distinct from its selection-capacity maximum', () => {
    const absent = scope(snapshot({ generalAdmissionAreas: [{ id: 'ga', label: 'GA' }] }));
    const absentCandidate = createSeatLayerPickerGACandidate(absent, 1, 'ga')!;
    expect(projectSeatLayerPickerDecision(absent, absentCandidate, 9)).toMatchObject({ available: 0, maximum: 3, quantity: 3 });
    const zero = scope(snapshot({ generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 0 }] })); setGACandidate(zero.controller, 2);
    expect(createSeatLayerPickerGACandidate(zero, 2, 'ga')).toBeTruthy();
    expect(projectSeatLayerPickerDecision(zero, createSeatLayerPickerGACandidate(zero, 2, 'ga'), 1)).toBeUndefined();
    const large = scope(snapshot({ generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 99 }] })); setGACandidate(large.controller, 3);
    expect(projectSeatLayerPickerDecision(large, createSeatLayerPickerGACandidate(large, 3, 'ga'), 9)).toMatchObject({ available: 99, maximum: 3 });
  });

  it('requires every snapshot, hello capability, command, and GA event leg', () => {
    const current = scope();
    expect(createSeatLayerPickerGACandidate(current, 1, 'ga')).toBeTruthy();
    expect(createSeatLayerPickerTableCandidate(current, 'table', 1)).toBeTruthy();
    expect(createSeatLayerPickerTierCandidate(current, 'seat', 1)).toBeTruthy();
    const noEvent = { ...current, controller: controller(() => current.snapshot, undefined, undefined, []) };
    expect(createSeatLayerPickerGACandidate(noEvent, 1, 'ga')).toBeUndefined();
    const noGACapability = { ...current, controller: controller(() => current.snapshot, ['tiers', 'table-quantity-v1', 'cart-line-remove-v1']) };
    expect(createSeatLayerPickerGACandidate(noGACapability, 1, 'ga')).toBeUndefined();
    const noGASnapshotFeature = scope(snapshot({ capabilities: ['tiers'] }));
    expect(createSeatLayerPickerGACandidate(noGASnapshotFeature, 1, 'ga')).toBeUndefined();
    const noTableCommand = { ...current, controller: controller(() => current.snapshot, undefined, ['picker.holdGA']) };
    expect(createSeatLayerPickerTableCandidate(noTableCommand, 'table', 1)).toBeUndefined();
    const noTierFeature = scope(snapshot({ capabilities: ['ga'] }));
    expect(createSeatLayerPickerTierCandidate(noTierFeature, 'seat', 1)).toBeUndefined();
  });

  it('rejects a stale authored seat tier at commit instead of silently choosing a fallback', async () => {
    const current = scope(snapshot({ selection: [{ id: 'seat', label: 'A-1', tiers: [{ id: 'child', name: 'Child', price: 10 }], tierId: 'retired' }] }));
    const candidate = createSeatLayerPickerTierCandidate(current, 'seat', 1)!;
    expect(projectSeatLayerPickerDecision(current, candidate)).toMatchObject({ tierId: 'child' });
    const calls: unknown[][] = [];
    (current.controller.setSeatTier as unknown as (...args: unknown[]) => Promise<void>) = async (...args) => { calls.push(args); };
    const coordinator = new SeatLayerPickerDecisionCoordinator(() => current);
    expect(coordinator.open(candidate)).toBe(true);
    await expect(coordinator.commit()).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it('omits GA tierId, preserves explicit tier null, and lets a table operation replace SDK removal', async () => {
    const current = scope(); const calls: unknown[][] = [];
    (current.controller.holdGA as unknown as (...args: unknown[]) => Promise<void>) = async (...args) => { calls.push(args); };
    (current.controller.setSeatTier as unknown as (...args: unknown[]) => Promise<void>) = async (...args) => { calls.push(args); };
    (current.controller.removeCartLine as unknown as (...args: unknown[]) => Promise<void>) = async (...args) => { calls.push(args); };
    const coordinator = new SeatLayerPickerDecisionCoordinator(() => current);
    coordinator.open(createSeatLayerPickerGACandidate(current, 1, 'ga')!);
    await coordinator.commit(2);
    coordinator.open(createSeatLayerPickerTierCandidate(current, 'seat', 2)!);
    await coordinator.commit(undefined, null);
    coordinator.open(createSeatLayerPickerTableCandidate(current, 'table', 3)!);
    await coordinator.removeTable(async (decision) => { calls.push(['override', decision.seat.label]); });
    expect(calls).toEqual([['ga', 2, {}], ['seat', null], ['override', 'Table A']]);
  });

  it('requires the exact SDK removal gate only when no operational table override is supplied', async () => {
    const base = scope();
    const noRemoval = controller(() => base.snapshot, ['ga', 'tiers', 'table-quantity-v1'], ['picker.holdGA', 'picker.setTableQuantity', 'picker.setSeatTier']);
    const current = { ...base, controller: noRemoval };
    const candidate = createSeatLayerPickerTableCandidate(current, 'table', 1)!;
    const coordinator = new SeatLayerPickerDecisionCoordinator(() => current);
    coordinator.open(candidate);
    await expect(coordinator.removeTable()).resolves.toBe(false);
    coordinator.reset(); coordinator.open(candidate);
    await expect(coordinator.removeTable(async () => undefined)).resolves.toMatchObject({ kind: 'table' });
    const heldSnapshot = snapshot({ hold: { active: true, owner: 'host' } });
    const hostHold = { ...current, snapshot: heldSnapshot, controller: controller(() => heldSnapshot, ['ga', 'tiers', 'table-quantity-v1'], ['picker.holdGA', 'picker.setTableQuantity', 'picker.setSeatTier']) };
    expect(createSeatLayerPickerTableCandidate(hostHold, 'table', 2)).toBeUndefined();
    const busy = { ...current, isBusy: true };
    expect(createSeatLayerPickerTableCandidate(busy, 'table', 3)).toBeUndefined();
  });

  it('does not send an old GA command after the typed store advances before press', async () => {
    const current = scope(); const calls: unknown[][] = [];
    (current.controller.holdGA as unknown as (...args: unknown[]) => Promise<void>) = async (...args) => { calls.push(args); };
    const candidate = createSeatLayerPickerGACandidate(current, 1, 'ga')!;
    const coordinator = new SeatLayerPickerDecisionCoordinator(() => current);
    expect(coordinator.open(candidate)).toBe(true);
    setGACandidate(current.controller, 2);
    await expect(coordinator.commit(1)).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it('quarantines a late GA result when the typed click store advances during its flight', async () => {
    const current = scope(); let resolve!: () => void;
    (current.controller.holdGA as unknown as () => Promise<void>) = () => new Promise<void>((done) => { resolve = done; });
    const coordinator = new SeatLayerPickerDecisionCoordinator(() => current);
    expect(coordinator.open(createSeatLayerPickerGACandidate(current, 1, 'ga')!)).toBe(true);
    const flight = coordinator.commit(1);
    setGACandidate(current.controller, 2);
    resolve();
    await expect(flight).resolves.toBeUndefined();
    expect(coordinator.getState().candidate).toBeUndefined();
  });

  it('returns deeply frozen decision observation data and contains subscriber failures', async () => {
    const current = scope(snapshot({
      generalAdmissionAreas: [{ id: 'ga', label: 'GA', available: 3, categoryKey: 'ga-category', tiers: [{ id: 'adult', name: 'Adult', price: 20 }] }],
      selection: [{
        id: 'seat', label: 'A-1', displayLabel: 'Section A · 1', categoryKey: 'seat-category', price: 42,
        tiers: [{ id: 'adult', name: 'Adult', price: 20 }], tierId: 'adult',
        commercial: { restrictedView: false, premium: true, note: 'Near aisle' }, displayType: 'seat', rowType: 'standard', objectId: 'inventory-1',
        sectionLabel: 'Section A', rowLabel: 'Row 1', seatNumber: '1', accessibility: ['step-free'], wheelchairSpaceType: 'companion',
      }],
    }));
    const candidate = createSeatLayerPickerGACandidate(current, 1, 'ga')!;
    const decision = projectSeatLayerPickerDecision(current, candidate)!;
    expect(Object.isFrozen(decision)).toBe(true);
    if (decision.kind === 'ga') {
      expect(Object.isFrozen(decision.area)).toBe(true);
      expect(Object.isFrozen(decision.area.tiers)).toBe(true);
      expect(Object.isFrozen(decision.area.tiers![0]!)).toBe(true);
      expect(decision.area.categoryKey).toBe('ga-category');
    }
    const tierCandidate = createSeatLayerPickerTierCandidate(current, 'seat', 2)!;
    const tierDecision = projectSeatLayerPickerDecision(current, tierCandidate)!;
    if (tierDecision.kind === 'tier') {
      expect(tierDecision.seat).toMatchObject({ categoryKey: 'seat-category', price: 42, objectId: 'inventory-1', sectionLabel: 'Section A', rowLabel: 'Row 1', seatNumber: '1', wheelchairSpaceType: 'companion' });
      expect(tierDecision.seat.accessibility).toEqual(['step-free']);
      expect(Object.isFrozen(tierDecision.seat.tiers)).toBe(true);
      expect(Object.isFrozen(tierDecision.seat.commercial)).toBe(true);
      expect(Object.isFrozen(tierDecision.seat.accessibility)).toBe(true);
    }
    const coordinator = new SeatLayerPickerDecisionCoordinator(() => current);
    coordinator.subscribe(() => { throw new Error('observer'); });
    expect(coordinator.open(candidate)).toBe(true);
    await expect(coordinator.commit()).resolves.toMatchObject({ kind: 'ga' });
  });

  it('rechecks live table eligibility before an override and serializes/retires late flights', async () => {
    const current = scope(); let active: SeatLayerPickerDecisionScope = current; let overridden = 0; let resolve!: () => void;
    const table = createSeatLayerPickerTableCandidate(current, 'table', 1)!;
    const coordinator = new SeatLayerPickerDecisionCoordinator(() => active);
    coordinator.open(table);
    active = { ...current, readOnly: true };
    await expect(coordinator.removeTable(async () => { overridden += 1; })).resolves.toBe(false);
    expect(overridden).toBe(0);
    active = current; coordinator.reset(); coordinator.open(table);
    (current.controller.holdGA as unknown as () => Promise<void>) = () => new Promise<void>((done) => { resolve = done; });
    setGACandidate(current.controller, 2); const ga = createSeatLayerPickerGACandidate(current, 2, 'ga')!;
    coordinator.reset(); coordinator.open(ga);
    const flight = coordinator.commit(1);
    setGACandidate(current.controller, 3);
    expect(coordinator.open(createSeatLayerPickerGACandidate(current, 3, 'ga')!)).toBe(false);
    active = { ...current, sessionId: 2, snapshot: snapshot({ sessionId: 'replacement' }) };
    coordinator.reset();
    resolve();
    await expect(flight).resolves.toBeUndefined();
  });

  it('uses the shared style boundary and keeps safe-area geometry finite', () => {
    const hostile = Object.create({ backgroundColor: '#bad' });
    Object.defineProperty(hostile, 'padding', { enumerable: true, get: () => { throw new Error('getter'); } });
    expect(sanitizeSeatLayerPickerStyle(hostile)).toEqual({});
    const cyclic: unknown[] = [{ backgroundColor: '#123456', borderWidth: 'bad', padding: 8, borderRadius: 99 }, false];
    cyclic.push(cyclic);
    expect(sanitizeSeatLayerPickerStyle(cyclic as never)).toEqual({ backgroundColor: '#123456', borderRadius: 24 });
    expect(sanitizeSeatLayerPickerStyle({ backgroundColor: 'red', borderColor: '#0f08' })).toEqual({ borderColor: '#0f08' });
    const styleProxy = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('proxy'); } });
    expect(sanitizeSeatLayerPickerStyle(styleProxy)).toEqual({});
    const insets = new Proxy({ top: 1000, right: -1, bottom: Number.NaN, left: 4 }, { getOwnPropertyDescriptor: () => { throw new Error('proxy'); } });
    expect(normalizeSeatLayerPickerDecisionPromptInsets(insets)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
