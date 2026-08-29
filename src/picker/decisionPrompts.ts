import type { CategoryTier, GAArea, SeatCommercialAttributes, SelectedSeat } from '../types';

import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerSnapshot } from './models';

export type SeatLayerPickerDecisionKind = 'ga' | 'table' | 'tier';
export type SeatLayerPickerDecisionTier = Readonly<CategoryTier>;
export type SeatLayerPickerDecisionSeat = Readonly<Omit<SelectedSeat,
  'tiers' | 'commercial' | 'accessibility'>> & Readonly<{
  readonly tiers?: readonly SeatLayerPickerDecisionTier[];
  readonly commercial?: Readonly<SeatCommercialAttributes>;
  readonly accessibility?: readonly string[];
}>;
export type SeatLayerPickerDecisionArea = Readonly<Omit<GAArea, 'tiers'>> & Readonly<{
  readonly tiers?: readonly SeatLayerPickerDecisionTier[];
}>;

export interface SeatLayerPickerDecisionScope {
  readonly controller: SeatLayerPickerController;
  readonly snapshot: SeatLayerPickerSnapshot | undefined;
  readonly sessionId: number;
  readonly readOnly: boolean;
  readonly isBusy: boolean;
}

/** Internal identity only. Buyer-facing callbacks receive a decision, never this candidate. */
export interface SeatLayerPickerDecisionCandidate {
  readonly kind: SeatLayerPickerDecisionKind;
  readonly id: string;
  readonly epoch: number;
  readonly controller: SeatLayerPickerController;
  readonly scopeSessionId: number;
  readonly snapshotSessionId: string;
  readonly clickEpoch?: number;
}

export interface SeatLayerPickerGADecision {
  readonly kind: 'ga';
  readonly area: SeatLayerPickerDecisionArea;
  readonly minimum: number;
  readonly maximum: number;
  /** The runtime area value only; it is not the selection-capacity fallback. */
  readonly available: number;
  readonly quantity: number;
  /** Undefined makes holdGA omit tierId exactly. */
  readonly tierId: string | undefined;
}
export interface SeatLayerPickerTableDecision {
  readonly kind: 'table';
  readonly seat: SeatLayerPickerDecisionSeat;
  readonly minimum: number;
  readonly maximum: number;
  readonly quantity: number;
}
export interface SeatLayerPickerTierDecision {
  readonly kind: 'tier';
  readonly seat: SeatLayerPickerDecisionSeat;
  readonly tiers: readonly SeatLayerPickerDecisionTier[];
  readonly tierId: string | null;
}
export type SeatLayerPickerDecision =
  | SeatLayerPickerGADecision
  | SeatLayerPickerTableDecision
  | SeatLayerPickerTierDecision;

export interface SeatLayerPickerDecisionState {
  readonly candidate: SeatLayerPickerDecisionCandidate | undefined;
  readonly inFlight: boolean;
  readonly error: unknown;
}
export type SeatLayerPickerTableRemovalOperation = (
  decision: SeatLayerPickerTableDecision,
) => void | Promise<void>;

export const initialSeatLayerPickerDecisionState: SeatLayerPickerDecisionState = Object.freeze({
  candidate: undefined,
  inFlight: false,
  error: undefined,
});

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}
function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}
function supports(
  controller: SeatLayerPickerController,
  capability: string,
  command: string,
  event?: string,
): boolean {
  return controller.mapController.isReady &&
    controller.mapController.supportsPickerCapability(capability) &&
    controller.mapController.supportsPickerCommand(command) &&
    (event === undefined || controller.mapController.supportsPickerEvent(event));
}
function feature(snapshot: SeatLayerPickerSnapshot, name: string): boolean {
  return snapshot.capabilities.includes(name);
}
function canMutate(scope: SeatLayerPickerDecisionScope, snapshot: SeatLayerPickerSnapshot): boolean {
  return !scope.readOnly && !scope.isBusy && !(snapshot.hold.active && snapshot.hold.owner === 'host');
}
function current(scope: SeatLayerPickerDecisionScope, candidate: SeatLayerPickerDecisionCandidate): boolean {
  return scope.controller === candidate.controller && scope.sessionId === candidate.scopeSessionId &&
    scope.snapshot?.sessionId === candidate.snapshotSessionId;
}
function currentGAClick(scope: SeatLayerPickerDecisionScope, candidate: SeatLayerPickerDecisionCandidate): boolean {
  if (candidate.kind !== 'ga') return true;
  const click = scope.controller.getGACandidate();
  return click !== undefined && click.clickEpoch === candidate.clickEpoch && click.areaId === candidate.id;
}
/** Commands are always planned from the controller store, never an old renderer frame. */
function live(scope: SeatLayerPickerDecisionScope): SeatLayerPickerDecisionScope {
  return Object.freeze({ ...scope, snapshot: scope.controller.getSnapshot() });
}
function selected(snapshot: SeatLayerPickerSnapshot, id: string): Readonly<SelectedSeat> | undefined {
  return snapshot.selection.find((seat) => seat.id === id);
}
function gaArea(snapshot: SeatLayerPickerSnapshot, id: string): Readonly<GAArea> | undefined {
  return snapshot.generalAdmissionAreas.find((area) => area.id === id);
}
function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const requested = positiveInteger(value) ? value : fallback;
  return Math.max(minimum, Math.min(maximum, requested));
}
function copyTier(tier: CategoryTier): SeatLayerPickerDecisionTier {
  return Object.freeze({
    id: tier.id,
    name: tier.name,
    price: tier.price,
    ...(tier.currency === undefined ? {} : { currency: tier.currency }),
    ...(tier.restriction === undefined ? {} : { restriction: tier.restriction }),
    ...(tier.buyerMessage === undefined ? {} : { buyerMessage: tier.buyerMessage }),
  });
}
function copyCommercial(commercial: SeatCommercialAttributes): Readonly<SeatCommercialAttributes> {
  return Object.freeze({
    ...(commercial.restrictedView === undefined ? {} : { restrictedView: commercial.restrictedView }),
    ...(commercial.obstructedView === undefined ? {} : { obstructedView: commercial.obstructedView }),
    ...(commercial.premium === undefined ? {} : { premium: commercial.premium }),
    ...(commercial.note === undefined ? {} : { note: commercial.note }),
  });
}
function copySeat(seat: Readonly<SelectedSeat>): SeatLayerPickerDecisionSeat {
  return Object.freeze({
    id: seat.id,
    label: seat.label,
    ...(seat.displayLabel === undefined ? {} : { displayLabel: seat.displayLabel }),
    ...(seat.categoryKey === undefined ? {} : { categoryKey: seat.categoryKey }),
    ...(seat.price === undefined ? {} : { price: seat.price }),
    ...(seat.objectType === undefined ? {} : { objectType: seat.objectType }),
    ...(seat.bookingMode === undefined ? {} : { bookingMode: seat.bookingMode }),
    ...(seat.quantity === undefined ? {} : { quantity: seat.quantity }),
    ...(seat.minOccupancy === undefined ? {} : { minOccupancy: seat.minOccupancy }),
    ...(seat.maxOccupancy === undefined ? {} : { maxOccupancy: seat.maxOccupancy }),
    ...(seat.capacity === undefined ? {} : { capacity: seat.capacity }),
    ...(seat.currency === undefined ? {} : { currency: seat.currency }),
    ...(seat.tierId === undefined ? {} : { tierId: seat.tierId }),
    ...(seat.tiers === undefined ? {} : { tiers: Object.freeze(seat.tiers.map(copyTier)) }),
    ...(seat.commercial === undefined ? {} : { commercial: copyCommercial(seat.commercial) }),
    ...(seat.displayType === undefined ? {} : { displayType: seat.displayType }),
    ...(seat.rowType === undefined ? {} : { rowType: seat.rowType }),
    ...(seat.objectId === undefined ? {} : { objectId: seat.objectId }),
    ...(seat.sectionLabel === undefined ? {} : { sectionLabel: seat.sectionLabel }),
    ...(seat.rowLabel === undefined ? {} : { rowLabel: seat.rowLabel }),
    ...(seat.seatNumber === undefined ? {} : { seatNumber: seat.seatNumber }),
    ...(seat.accessibility === undefined ? {} : { accessibility: Object.freeze([...seat.accessibility]) }),
    ...(seat.wheelchairSpaceType === undefined ? {} : { wheelchairSpaceType: seat.wheelchairSpaceType }),
  });
}
function copyArea(area: Readonly<GAArea>): SeatLayerPickerDecisionArea {
  return Object.freeze({
    id: area.id,
    ...(area.label === undefined ? {} : { label: area.label }),
    ...(area.available === undefined ? {} : { available: area.available }),
    ...(area.capacity === undefined ? {} : { capacity: area.capacity }),
    ...(area.categoryKey === undefined ? {} : { categoryKey: area.categoryKey }),
    ...(area.currency === undefined ? {} : { currency: area.currency }),
    ...(area.price === undefined ? {} : { price: area.price }),
    ...(area.tiers === undefined ? {} : { tiers: Object.freeze(area.tiers.map(copyTier)) }),
  });
}

export function createSeatLayerPickerGACandidate(
  scope: SeatLayerPickerDecisionScope,
  clickEpoch: number,
  areaId: string,
): SeatLayerPickerDecisionCandidate | undefined {
  const next = live(scope); const snapshot = next.snapshot;
  const click = next.controller.getGACandidate();
  if (!snapshot || !positiveInteger(clickEpoch) || !areaId || !canMutate(next, snapshot) ||
    !feature(snapshot, 'ga') || !supports(next.controller, 'ga', 'picker.holdGA', 'ga.click') ||
    !click || click.clickEpoch !== clickEpoch || click.areaId !== areaId ||
    !gaArea(snapshot, areaId)) return undefined;
  return Object.freeze({ kind: 'ga', id: areaId, epoch: clickEpoch, clickEpoch, controller: next.controller, scopeSessionId: next.sessionId, snapshotSessionId: snapshot.sessionId });
}

export function createSeatLayerPickerTableCandidate(
  scope: SeatLayerPickerDecisionScope,
  seatId: string,
  epoch: number,
): SeatLayerPickerDecisionCandidate | undefined {
  const next = live(scope); const snapshot = next.snapshot; const seat = snapshot && selected(snapshot, seatId);
  if (!snapshot || !positiveInteger(epoch) || !seatId || !canMutate(next, snapshot) ||
    !supports(next.controller, 'table-quantity-v1', 'picker.setTableQuantity') ||
    seat?.objectType !== 'table' || seat.bookingMode !== 'variable' || !seat.label) return undefined;
  return Object.freeze({ kind: 'table', id: seatId, epoch, controller: next.controller, scopeSessionId: next.sessionId, snapshotSessionId: snapshot.sessionId });
}

export function createSeatLayerPickerTierCandidate(
  scope: SeatLayerPickerDecisionScope,
  seatId: string,
  epoch: number,
): SeatLayerPickerDecisionCandidate | undefined {
  const next = live(scope); const snapshot = next.snapshot; const seat = snapshot && selected(snapshot, seatId);
  if (!snapshot || !positiveInteger(epoch) || !seatId || !canMutate(next, snapshot) ||
    !feature(snapshot, 'tiers') || !supports(next.controller, 'tiers', 'picker.setSeatTier') || !seat?.tiers?.length) return undefined;
  return Object.freeze({ kind: 'tier', id: seatId, epoch, controller: next.controller, scopeSessionId: next.sessionId, snapshotSessionId: snapshot.sessionId });
}

/** Projects current, buyer-safe decision data. It intentionally retains no raw click payload. */
export function projectSeatLayerPickerDecision(
  scope: SeatLayerPickerDecisionScope,
  candidate: SeatLayerPickerDecisionCandidate | undefined,
  quantity?: number,
  tierId?: string | null,
  strictTier = false,
): SeatLayerPickerDecision | undefined {
  const next = live(scope); const snapshot = next.snapshot;
  if (!snapshot || !candidate || !current(next, candidate) || !canMutate(next, snapshot)) return undefined;
  if (candidate.kind === 'ga') {
    const click = next.controller.getGACandidate();
    if (!click || click.clickEpoch !== candidate.clickEpoch || click.areaId !== candidate.id) return undefined;
    const area = gaArea(snapshot, candidate.id);
    if (!area || !feature(snapshot, 'ga') || !supports(next.controller, 'ga', 'picker.holdGA', 'ga.click')) return undefined;
    const remaining = positiveInteger(snapshot.maxSelection) && nonNegativeInteger(snapshot.ticketCount)
      ? Math.max(0, snapshot.maxSelection - snapshot.ticketCount) : 0;
    const advertisedAvailable = area.available === undefined ? undefined
      : nonNegativeInteger(area.available) ? area.available : 0;
    const maximum = advertisedAvailable === undefined ? remaining : Math.min(remaining, advertisedAvailable);
    if (maximum < 1) return undefined;
    const tiers = area.tiers ?? [];
    const requested = typeof tierId === 'string' ? tierId : undefined;
    if (strictTier && requested !== undefined && !tiers.some((tier) => tier.id === requested)) return undefined;
    const resolvedTier = tiers.length === 0 ? undefined
      : requested !== undefined && tiers.some((tier) => tier.id === requested) ? requested : tiers[0]!.id;
    return Object.freeze({ kind: 'ga', area: copyArea(area), minimum: 1, maximum,
      available: advertisedAvailable ?? 0, quantity: clamp(quantity, 1, maximum, 1), tierId: resolvedTier });
  }
  const seat = selected(snapshot, candidate.id);
  if (!seat) return undefined;
  if (candidate.kind === 'table') {
    if (!supports(next.controller, 'table-quantity-v1', 'picker.setTableQuantity') ||
      seat.objectType !== 'table' || seat.bookingMode !== 'variable' || !seat.label) return undefined;
    const minimum = positiveInteger(seat.minOccupancy) ? seat.minOccupancy : 1;
    const sourceMaximum = positiveInteger(seat.maxOccupancy) ? seat.maxOccupancy
      : positiveInteger(seat.capacity) ? seat.capacity : minimum;
    const maximum = Math.max(minimum, sourceMaximum);
    return Object.freeze({ kind: 'table', seat: copySeat(seat), minimum, maximum,
      quantity: clamp(quantity, minimum, maximum, positiveInteger(seat.quantity) ? seat.quantity : minimum) });
  }
  if (!feature(snapshot, 'tiers') || !supports(next.controller, 'tiers', 'picker.setSeatTier') || !seat.tiers?.length) return undefined;
  const tiers = seat.tiers.map(copyTier); const requested = tierId === null ? null : typeof tierId === 'string' ? tierId : undefined;
  const snapshotTierIsValid = typeof seat.tierId === 'string' && tiers.some((tier) => tier.id === seat.tierId);
  if (strictTier && ((requested !== null && requested !== undefined && !tiers.some((tier) => tier.id === requested)) ||
    (requested === undefined && seat.tierId !== undefined && !snapshotTierIsValid))) return undefined;
  const resolvedTier = requested === null ? null
    : requested !== undefined && tiers.some((tier) => tier.id === requested) ? requested
      : snapshotTierIsValid ? seat.tierId! : tiers[0]!.id;
  return Object.freeze({ kind: 'tier', seat: copySeat(seat), tiers: Object.freeze(tiers), tierId: resolvedTier });
}

/** Serializes a prompt lifetime; a late flight cannot alter a replacement session or prompt. */
export class SeatLayerPickerDecisionCoordinator {
  private state = initialSeatLayerPickerDecisionState;
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private flight: Readonly<{ generation: number; candidate: SeatLayerPickerDecisionCandidate }> | undefined;
  constructor(private readonly scope: () => SeatLayerPickerDecisionScope) {}
  getState = (): SeatLayerPickerDecisionState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  open(candidate: SeatLayerPickerDecisionCandidate): boolean {
    const next = live(this.scope());
    if (this.flight?.generation === this.generation || this.state.candidate !== undefined ||
      !projectSeatLayerPickerDecision(next, candidate)) return false;
    this.set({ candidate, inFlight: false, error: undefined });
    return true;
  }
  dismiss(epoch: number): boolean {
    if (this.state.candidate?.epoch !== epoch || this.flight?.generation === this.generation) return false;
    this.set(initialSeatLayerPickerDecisionState);
    return true;
  }
  reset(): void { this.generation += 1; this.set(initialSeatLayerPickerDecisionState); }
  dispose(): void { this.reset(); this.listeners.clear(); }
  async commit(quantity?: number, tierId?: string | null): Promise<SeatLayerPickerDecision | false | undefined> {
    const candidate = this.state.candidate; const before = live(this.scope());
    const decision = projectSeatLayerPickerDecision(before, candidate, quantity, tierId, true);
    if (!candidate || !decision || before.isBusy || this.flight?.generation === this.generation) return false;
    const flight = Object.freeze({ generation: this.generation, candidate });
    this.flight = flight; this.set({ candidate, inFlight: true, error: undefined });
    try {
      if (decision.kind === 'ga') await before.controller.holdGA(decision.area.id, decision.quantity, decision.tierId === undefined ? {} : { tierId: decision.tierId });
      else if (decision.kind === 'table') await before.controller.setTableQuantity(decision.seat.label, decision.quantity);
      else await before.controller.setSeatTier(decision.seat.id, decision.tierId);
      const after = live(this.scope());
      if (!this.owns(flight) || !current(after, candidate)) return undefined;
      if (!currentGAClick(after, candidate)) {
        this.set(initialSeatLayerPickerDecisionState);
        return undefined;
      }
      this.set(initialSeatLayerPickerDecisionState);
      return decision;
    } catch (error) {
      const after = live(this.scope());
      if (!this.owns(flight) || !current(after, candidate)) return undefined;
      if (!currentGAClick(after, candidate)) {
        this.set(initialSeatLayerPickerDecisionState);
        return undefined;
      }
      this.set({ candidate, inFlight: false, error });
      return false;
    } finally {
      if (this.flight === flight) this.flight = undefined;
      if (this.owns(flight) && this.state.inFlight) this.set({ ...this.state, inFlight: false });
    }
  }
  async removeTable(operation?: SeatLayerPickerTableRemovalOperation): Promise<SeatLayerPickerTableDecision | false | undefined> {
    const candidate = this.state.candidate; const before = live(this.scope());
    const decision = projectSeatLayerPickerDecision(before, candidate);
    if (!candidate || decision?.kind !== 'table' || before.isBusy || this.flight?.generation === this.generation ||
      (!operation && !supports(before.controller, 'cart-line-remove-v1', 'picker.removeCartLine'))) return false;
    const flight = Object.freeze({ generation: this.generation, candidate });
    this.flight = flight; this.set({ candidate, inFlight: true, error: undefined });
    try {
      if (operation) await operation(decision); else await before.controller.removeCartLine(decision.seat.label);
      const after = live(this.scope());
      if (!this.owns(flight) || !current(after, candidate)) return undefined;
      this.set(initialSeatLayerPickerDecisionState);
      return decision;
    } catch (error) {
      const after = live(this.scope());
      if (!this.owns(flight) || !current(after, candidate)) return undefined;
      this.set({ candidate, inFlight: false, error });
      return false;
    } finally {
      if (this.flight === flight) this.flight = undefined;
      if (this.owns(flight) && this.state.inFlight) this.set({ ...this.state, inFlight: false });
    }
  }
  private owns(flight: Readonly<{ generation: number; candidate: SeatLayerPickerDecisionCandidate }>): boolean {
    return flight.generation === this.generation && this.state.candidate === flight.candidate;
  }
  private set(state: SeatLayerPickerDecisionState): void {
    this.state = Object.freeze(state);
    for (const listener of this.listeners) {
      try { listener(); } catch { /* A subscriber cannot interrupt booking state. */ }
    }
  }
}

/** Controlled confirmation-card seam. A selector changes the value; this commits its one existing Select action. */
export async function commitSeatLayerPickerTierDecision(
  scope: () => SeatLayerPickerDecisionScope,
  candidate: SeatLayerPickerDecisionCandidate,
  tierId?: string | null,
): Promise<SeatLayerPickerDecision | false | undefined> {
  const coordinator = new SeatLayerPickerDecisionCoordinator(scope);
  if (!coordinator.open(candidate)) return false;
  return coordinator.commit(undefined, tierId);
}
