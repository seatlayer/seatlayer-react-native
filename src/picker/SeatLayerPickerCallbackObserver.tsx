import React, { useEffect, useLayoutEffect, useRef } from 'react';

import type { SeatLayerError } from '../errors';
import type { SelectedSeat, SelectionValidity } from '../types';
import type { SeatLayerPickerHold } from './models';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import type { SeatLayerPickerCallbacks } from './callbacks';

type Lease = Readonly<{ readonly controller: SeatLayerPickerScopeValue['controller']; readonly scopeSession: number; readonly runtimeSession: string }>;
type SelectionKey = readonly (readonly [string, string | undefined])[];
type ValidityKey = Readonly<{ readonly isValid: boolean; readonly count: number; readonly required: number; readonly remaining: number }>;
type HoldKey = Readonly<{ readonly active: boolean; readonly owner: string | undefined; readonly expiresAt: number | undefined }>;
type Observed = { selection: SelectionKey; validity: ValidityKey | undefined; hold: HoldKey | undefined; theme: 'light' | 'dark' | undefined };

const emptyObserved = (): Observed => ({ selection: [], validity: undefined, hold: undefined, theme: undefined });

export interface SeatLayerPickerCallbackObserverProps {
  readonly callbacks?: SeatLayerPickerCallbacks;
}

/** Non-visual observer for snapshot transitions and advertised raw runtime events. */
export function SeatLayerPickerCallbackObserver({ callbacks }: SeatLayerPickerCallbackObserverProps): null {
  const scope = useSeatLayerPickerScope();
  const callbacksRef = useRef(callbacks);
  const scopeRef = useRef(scope);
  const activeRef = useRef(false);
  const leaseRef = useRef<Lease | undefined>(undefined);
  const observedRef = useRef<Observed>(emptyObserved());
  useLayoutEffect(() => { callbacksRef.current = callbacks; scopeRef.current = scope; });
  const runtimeSession = scope.snapshot?.sessionId ?? '';
  useLayoutEffect(() => {
    const previousLease = leaseRef.current;
    const preserveInitialTheme = previousLease?.controller === scope.controller && previousLease.scopeSession === scope.sessionId &&
      previousLease.runtimeSession === '' && runtimeSession !== '';
    activeRef.current = true;
    leaseRef.current = Object.freeze({ controller: scope.controller, scopeSession: scope.sessionId, runtimeSession });
    observedRef.current = { ...emptyObserved(), theme: preserveInitialTheme ? observedRef.current.theme : undefined };
    return () => { activeRef.current = false; };
  }, [runtimeSession, scope.controller, scope.sessionId]);
  useEffect(() => {
    const lease = leaseRef.current;
    if (!lease) return undefined;
    const controller = lease.controller.mapController;
    const emit = <K extends keyof SeatLayerPickerCallbacks>(key: K, ...args: Parameters<NonNullable<SeatLayerPickerCallbacks[K]>>) => {
      if (!isCurrent(activeRef, scopeRef.current, leaseRef.current, lease)) return;
      const callback = callbacksRef.current?.[key] as ((...values: typeof args) => void | Promise<void>) | undefined;
      try {
        void Promise.resolve(callback?.(...args)).catch((error) => reportCallbackFailure(activeRef, scopeRef, leaseRef, lease, key, error));
      } catch (error) { reportCallbackFailure(activeRef, scopeRef, leaseRef, lease, key, error); }
    };
    const remove = [
      controller.on('holdExpired', () => emit('onHoldExpired')),
      controller.on('accessExpired', (event) => emit('onAccessExpired', event)),
      controller.on('accessUnavailable', (event) => emit('onAccessUnavailable', event)),
      controller.on('selectedObjectsUnavailable', (event) => emit('onSelectedObjectUnavailable', event)),
      controller.on('error', (error) => emit('onError', error)),
    ];
    return () => { for (const dispose of remove) try { dispose(); } catch { /* Runtime cleanup is inert. */ } };
  }, [runtimeSession, scope.controller, scope.sessionId]);
  useEffect(() => {
    const lease = leaseRef.current;
    const theme = scope.resolvedTheme.themeMode;
    if (!lease || !isCurrent(activeRef, scopeRef.current, leaseRef.current, lease)) return;
    if (observedRef.current.theme === theme) return;
    observedRef.current = { ...observedRef.current, theme };
    emitCurrent(activeRef, scopeRef, leaseRef, lease, callbacksRef, 'onThemeResolved', theme);
  }, [runtimeSession, scope.controller, scope.resolvedTheme.themeMode, scope.sessionId]);
  useEffect(() => {
    const lease = leaseRef.current;
    const snapshot = scope.snapshot;
    if (!lease || !snapshot || !isCurrent(activeRef, scopeRef.current, leaseRef.current, lease)) return;
    const previous = observedRef.current;
    const selection = selectionKey(snapshot.selection);
    const validity = validityKey(snapshot.selectionValidity);
    const hold = holdKey(snapshot.hold);
    observedRef.current = { ...previous, selection, validity, hold };
    if (!sameSelection(previous.selection, selection)) emitCurrent(activeRef, scopeRef, leaseRef, lease, callbacksRef, 'onSelectionChanged', snapshot.selection);
    if (!sameValidity(previous.validity, validity) && snapshot.selectionValidity) emitCurrent(activeRef, scopeRef, leaseRef, lease, callbacksRef, 'onSelectionValidityChanged', snapshot.selectionValidity);
    if (!sameHold(previous.hold, hold)) emitCurrent(activeRef, scopeRef, leaseRef, lease, callbacksRef, 'onHoldChanged', snapshot.hold.active ? snapshot.hold : undefined, undefined);
  }, [runtimeSession, scope.controller, scope.sessionId, scope.snapshot]);
  return null;
}

function isCurrent(active: React.MutableRefObject<boolean>, scope: SeatLayerPickerScopeValue, current: Lease | undefined, lease: Lease): boolean {
  return active.current && current === lease && scope.controller === lease.controller && scope.sessionId === lease.scopeSession &&
    (scope.snapshot?.sessionId ?? '') === lease.runtimeSession;
}
function selectionKey(selection: readonly SelectedSeat[]): SelectionKey { return selection.map((seat) => [seat.id, seat.tierId] as const); }
function validityKey(value: Readonly<SelectionValidity> | undefined): ValidityKey | undefined {
  return value ? { isValid: value.isValid, count: value.count, required: value.required, remaining: value.remaining } : undefined;
}
function holdKey(value: SeatLayerPickerHold): HoldKey | undefined {
  return value.active ? { active: true, owner: value.owner, expiresAt: value.expiresAt } : undefined;
}
function sameSelection(left: SelectionKey, right: SelectionKey): boolean { return left.length === right.length && left.every((seat, index) => seat[0] === right[index]?.[0] && seat[1] === right[index]?.[1]); }
function sameValidity(left: ValidityKey | undefined, right: ValidityKey | undefined): boolean { return left?.isValid === right?.isValid && left?.count === right?.count && left?.required === right?.required && left?.remaining === right?.remaining; }
function sameHold(left: HoldKey | undefined, right: HoldKey | undefined): boolean { return left?.active === right?.active && left?.owner === right?.owner && left?.expiresAt === right?.expiresAt; }
function emitCurrent<K extends keyof SeatLayerPickerCallbacks>(active: React.MutableRefObject<boolean>, scopeRef: React.MutableRefObject<SeatLayerPickerScopeValue>, leaseRef: React.MutableRefObject<Lease | undefined>, lease: Lease, callbacks: React.MutableRefObject<SeatLayerPickerCallbacks | undefined>, key: K, ...args: Parameters<NonNullable<SeatLayerPickerCallbacks[K]>>): void {
  if (!isCurrent(active, scopeRef.current, leaseRef.current, lease)) return;
  const callback = callbacks.current?.[key] as ((...values: typeof args) => void | Promise<void>) | undefined;
  try { void Promise.resolve(callback?.(...args)).catch((error) => reportCallbackFailure(active, scopeRef, leaseRef, lease, key, error)); } catch (error) { reportCallbackFailure(active, scopeRef, leaseRef, lease, key, error); }
}
function reportCallbackFailure(active: React.MutableRefObject<boolean>, scopeRef: React.MutableRefObject<SeatLayerPickerScopeValue>, leaseRef: React.MutableRefObject<Lease | undefined>, lease: Lease, key: keyof SeatLayerPickerCallbacks, error: unknown): void {
  const scope = scopeRef.current;
  if (key === 'onError' || !isCurrent(active, scope, leaseRef.current, lease)) return;
  try { scope.reportError(error); } catch { /* Host callbacks never escape the picker. */ }
}
