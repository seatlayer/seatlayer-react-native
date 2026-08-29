import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { SelectedSeat } from '../types';
import type { SeatLayerPickerController } from './controller';
import {
  commitSeatLayerPickerTierDecision,
  createSeatLayerPickerTierCandidate,
  type SeatLayerPickerDecisionCandidate,
  type SeatLayerPickerDecisionScope,
} from './decisionPrompts';
import { seatLayerPickerSeatIdentity } from './pendingConfirmationState';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';

export type SeatLayerPickerConfirmationAction = 'confirm' | 'cancel' | 'seatView' | 'venue3d';
export type SeatLayerPickerDeepReadonly<Value> = Value extends (...args: never[]) => unknown ? Value
  : Value extends readonly (infer Item)[] ? readonly SeatLayerPickerDeepReadonly<Item>[]
    : Value extends object ? { readonly [Key in keyof Value]: SeatLayerPickerDeepReadonly<Value[Key]> } : Value;

export interface SeatLayerPickerConfirmationActionEvent {
  readonly action: SeatLayerPickerConfirmationAction;
  readonly seat: SeatLayerPickerDeepReadonly<SelectedSeat>;
}

export interface SeatLayerPickerConfirmationActions {
  readonly showSeatView?: boolean;
  readonly show3D?: boolean;
  readonly onAction?: (event: SeatLayerPickerConfirmationActionEvent) => void | Promise<void>;
}

export interface SeatLayerPickerConfirmationModel {
  readonly scope: SeatLayerPickerScopeValue;
  readonly seat: SelectedSeat;
  readonly observedSeat: SeatLayerPickerDeepReadonly<SelectedSeat>;
  readonly candidate: SeatLayerPickerDecisionCandidate | undefined;
  readonly tierId: string | null | undefined;
  readonly setTierId: React.Dispatch<React.SetStateAction<string | null | undefined>>;
  readonly busy: boolean;
  readonly inspection: readonly Readonly<{ kind: 'seatView' | 'venue3d'; label: string }>[];
  readonly run: (action: SeatLayerPickerConfirmationAction) => void;
}

type PendingLease = Readonly<{
  readonly controller: SeatLayerPickerController;
  readonly scopeSessionId: number;
  readonly runtimeSessionId: string;
  readonly identity: string;
  readonly key: string;
}>;
type Flight = Readonly<{ readonly key: string; readonly token: object }>;

const controllerKeys = new WeakMap<object, number>();
let controllerKeyCount = 0;

/** Shares one pending-seat action workflow between compact and wide presentations. */
export function SeatLayerPickerConfirmationState(props: SeatLayerPickerConfirmationActions & {
  readonly children: (model: SeatLayerPickerConfirmationModel) => React.ReactElement;
}): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const pending = currentPending(scope);
  const lease = useMemo(
    () => pending === undefined ? undefined : pendingLease(scope, pending),
    [scope.controller, scope.sessionId, scope.snapshot?.sessionId, pending],
  );
  if (!pending || !lease) return null;
  return <Session key={lease.key} lease={lease} pending={pending} props={props} scope={scope} />;
}

function Session({ lease, pending, props, scope }: Readonly<{
  lease: PendingLease;
  pending: SelectedSeat;
  props: SeatLayerPickerConfirmationActions & { readonly children: (model: SeatLayerPickerConfirmationModel) => React.ReactElement };
  scope: SeatLayerPickerScopeValue;
}>): React.ReactElement {
  const [tierId, setTierId] = useState<string | null | undefined>(undefined);
  const [flightKey, setFlightKey] = useState<string | undefined>(undefined);
  const flightRef = useRef<Flight | undefined>(undefined);
  const waitForSeatViewRef = useRef<(() => void) | undefined>(undefined);
  const activeRef = useRef(false);
  const scopeRef = useRef(scope);
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    scopeRef.current = scope;
    propsRef.current = props;
  });
  useLayoutEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; waitForSeatViewRef.current?.(); };
  }, []);
  const candidate = useMemo(
    () => tierCandidate(scope, pending, tierEpoch(lease.key)),
    [lease.key, pending, scope.controller, scope.isBusy, scope.readOnly, scope.sessionId, scope.snapshot],
  );
  const observedSeat = useMemo(() => immutableSeat(pending), [lease.key, pending]);
  const inspection = inspectionActions(scope, props);
  const observe = (action: SeatLayerPickerConfirmationAction) => {
    const callback = propsRef.current.onAction;
    try { void Promise.resolve(callback?.(Object.freeze({ action, seat: observedSeat }))).catch(() => undefined); } catch { /* observational */ }
  };
  const run = (action: SeatLayerPickerConfirmationAction) => {
    const live = scopeRef.current;
    if (!isActiveCurrent(activeRef, live, lease) || flightRef.current?.key === lease.key) return;
    const flight = Object.freeze({ key: lease.key, token: Object.freeze({}) });
    flightRef.current = flight;
    setFlightKey(lease.key);
    const task = (async () => {
      if (action === 'cancel') {
        if (await live.cancelPending() && mayComplete(activeRef, scopeRef.current, lease)) observe('cancel');
        return;
      }
      if (action === 'confirm') {
        const selectedTier = tierId === undefined ? candidateTier(candidate, live) : tierId;
        if (candidate && selectedTier !== candidateTier(candidate, live)) {
          const committed = await commitSeatLayerPickerTierDecision(() => decisionScope(scopeRef.current), candidate, selectedTier);
          if (!committed || !isActiveCurrent(activeRef, scopeRef.current, lease)) return;
        }
        if (!isActiveCurrent(activeRef, scopeRef.current, lease)) return;
        scopeRef.current.confirmPending();
        if (mayComplete(activeRef, scopeRef.current, lease)) observe('confirm');
        return;
      }
      try {
        const current = scopeRef.current;
        if (!isActiveCurrent(activeRef, current, lease) || !canInspect(current, pending, action)) return;
        const mounted = action === 'seatView'
          ? await inspectSeatView(current.controller, pending.id, waitForSeatViewRef)
          : await inspectVenue3D(current.controller, pending.id);
        if (!mounted) {
          if (action === 'venue3d') reportCurrentError(activeRef, scopeRef.current, lease, new Error('Venue view did not mount.'));
          return;
        }
        if (!isActiveCurrent(activeRef, scopeRef.current, lease)) return;
        scopeRef.current.confirmPending();
        if (mayComplete(activeRef, scopeRef.current, lease)) observe(action);
      } catch (error) { reportCurrentError(activeRef, scopeRef.current, lease, error); }
    })().catch((error) => reportCurrentError(activeRef, scopeRef.current, lease, error));
    void task.finally(() => {
      if (flightRef.current !== flight) return;
      flightRef.current = undefined;
      if (activeRef.current) setFlightKey((current) => current === lease.key ? undefined : current);
    });
  };
  return props.children(Object.freeze({ scope, seat: pending, observedSeat, candidate, tierId, setTierId, busy: scope.isBusy || scope.readOnly || flightKey === lease.key, inspection, run }));
}

function currentPending(scope: SeatLayerPickerScopeValue): SelectedSeat | undefined {
  const pending = scope.pendingSeat;
  if (!pending) return undefined;
  const identity = seatLayerPickerSeatIdentity(pending);
  const seat = identity === null ? undefined : scope.snapshot?.selection.find((item) => seatLayerPickerSeatIdentity(item) === identity);
  return seat?.objectType === 'table' && seat.bookingMode === 'variable' ? undefined : seat;
}
function pendingLease(scope: SeatLayerPickerScopeValue, seat: SelectedSeat): PendingLease {
  const controller = scope.controller;
  const known = controllerKeys.get(controller);
  const controllerKey = known ?? ++controllerKeyCount;
  if (known === undefined) controllerKeys.set(controller, controllerKey);
  const runtimeSessionId = scope.snapshot?.sessionId ?? '';
  const identity = seatLayerPickerSeatIdentity(seat) ?? '';
  return Object.freeze({ controller, scopeSessionId: scope.sessionId, runtimeSessionId, identity, key: `${controllerKey}:${scope.sessionId}:${runtimeSessionId}:${identity}` });
}
function sameLease(scope: SeatLayerPickerScopeValue, lease: PendingLease): boolean {
  return scope.controller === lease.controller && scope.sessionId === lease.scopeSessionId && scope.snapshot?.sessionId === lease.runtimeSessionId;
}
function isActiveCurrent(active: React.MutableRefObject<boolean>, scope: SeatLayerPickerScopeValue, lease: PendingLease): boolean {
  const seat = currentPending(scope);
  return active.current && seat !== undefined && sameLease(scope, lease) && seatLayerPickerSeatIdentity(seat) === lease.identity;
}
function mayComplete(active: React.MutableRefObject<boolean>, scope: SeatLayerPickerScopeValue, lease: PendingLease): boolean {
  const next = currentPending(scope);
  return active.current && sameLease(scope, lease) && (next === undefined || seatLayerPickerSeatIdentity(next) === lease.identity);
}
function decisionScope(scope: SeatLayerPickerScopeValue): SeatLayerPickerDecisionScope {
  return Object.freeze({ controller: scope.controller, snapshot: scope.snapshot, sessionId: scope.sessionId, readOnly: scope.readOnly, isBusy: scope.isBusy });
}
function tierCandidate(scope: SeatLayerPickerScopeValue, seat: SelectedSeat, epoch: number): SeatLayerPickerDecisionCandidate | undefined {
  return createSeatLayerPickerTierCandidate(decisionScope(scope), seat.id, epoch);
}
function tierEpoch(key: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < key.length; index += 1) value = Math.imul(value ^ key.charCodeAt(index), 16_777_619);
  return (value >>> 0) % 2_147_483_646 + 1;
}
function candidateTier(candidate: SeatLayerPickerDecisionCandidate | undefined, scope: SeatLayerPickerScopeValue): string | null | undefined {
  return candidate === undefined ? undefined : scope.snapshot?.selection.find((seat) => seat.id === candidate.id)?.tierId;
}
function immutableSeat(seat: SelectedSeat): SeatLayerPickerDeepReadonly<SelectedSeat> {
  return Object.freeze({ ...seat, ...(seat.tiers === undefined ? {} : { tiers: Object.freeze(seat.tiers.map((tier) => Object.freeze({ ...tier }))) }), ...(seat.accessibility === undefined ? {} : { accessibility: Object.freeze([...seat.accessibility]) }), ...(seat.commercial === undefined ? {} : { commercial: Object.freeze({ ...seat.commercial }) }) });
}
function reportCurrentError(active: React.MutableRefObject<boolean>, scope: SeatLayerPickerScopeValue, lease: PendingLease, error: unknown): void {
  if (!isActiveCurrent(active, scope, lease)) return;
  try { scope.reportError(error); } catch { /* contained */ }
}
function inspectionActions(scope: SeatLayerPickerScopeValue, props: SeatLayerPickerConfirmationActions): readonly Readonly<{ kind: 'seatView' | 'venue3d'; label: string }>[] {
  const capabilities = scope.snapshot?.capabilities ?? [];
  return Object.freeze([
    ...(props.showSeatView !== false && capabilities.includes('seatView') && scope.controller.supportsSeatView ? [{ kind: 'seatView' as const, label: scope.strings.translate('viewFromHere') }] : []),
    ...(props.show3D !== false && capabilities.includes('venue3d') && scope.controller.supportsVenue3D ? [{ kind: 'venue3d' as const, label: scope.strings.translate('venue3D') }] : []),
  ]);
}
function canInspect(scope: SeatLayerPickerScopeValue, seat: SelectedSeat, action: 'seatView' | 'venue3d'): boolean {
  const snapshot = scope.controller.getSnapshot();
  if (!snapshot || snapshot.sessionId !== scope.snapshot?.sessionId || !snapshot.selection.some((item) => sameInspectionSeat(item, seat))) return false;
  return action === 'seatView' ? snapshot.capabilities.includes('seatView') && scope.controller.supportsSeatView : snapshot.capabilities.includes('venue3d') && scope.controller.supportsVenue3D;
}
/** A recycled inventory id is not the same inspectable seat in another section. */
function sameInspectionSeat(item: SelectedSeat, seat: SelectedSeat): boolean {
  if (item.id !== seat.id || item.label !== seat.label) return false;
  const expected = seat.sectionLabel?.trim();
  return !expected || item.sectionLabel?.trim().toLocaleLowerCase() === expected.toLocaleLowerCase();
}
async function inspectVenue3D(controller: SeatLayerPickerController, seatId: string): Promise<boolean> {
  await controller.setBuyerView('venue3d', { flyToSeatId: seatId });
  const map = controller.getSnapshot()?.map;
  return map?.buyerView === 'venue3d' && map.view3DTargetSeatId === seatId;
}
async function inspectSeatView(controller: SeatLayerPickerController, seatId: string, cancellation: React.MutableRefObject<(() => void) | undefined>): Promise<boolean> {
  await controller.openSeatView(seatId);
  if (!controller.supportsNativeSeatViewChrome || controller.getSeatView()?.seatId === seatId) return true;
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | undefined;
    const finish = (mounted: boolean) => { if (!unsubscribe) return; unsubscribe(); unsubscribe = undefined; if (cancellation.current === cancel) cancellation.current = undefined; resolve(mounted); };
    const cancel = () => finish(false);
    unsubscribe = controller.subscribeSeatView(() => { if (controller.getSeatView()?.seatId === seatId) finish(true); });
    cancellation.current = cancel;
    if (controller.getSeatView()?.seatId === seatId) finish(true);
  });
}
