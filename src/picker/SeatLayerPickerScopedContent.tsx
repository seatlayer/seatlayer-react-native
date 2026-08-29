import React, { useCallback, useLayoutEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { SeatLayerPickerAdaptiveLayout } from './SeatLayerPickerAdaptiveLayout';
import type { SeatLayerPickerBuilders } from './builders';
import { invokeSeatLayerPickerCallback } from './callback';
import type { SeatLayerPickerCallbacks } from './callbacks';
import type { SeatLayerPickerHapticAdapter } from './hapticPlayer';
import type { SeatLayerPickerCheckoutHandoff } from './models';
import type { SeatLayerPickerOptions } from './options';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import type { SeatLayerPickerSafeAreaInsetInput } from './safeAreaInsets';

export interface SeatLayerPickerScopedContentProps {
  readonly options?: SeatLayerPickerOptions;
  readonly builders?: SeatLayerPickerBuilders;
  readonly callbacks?: SeatLayerPickerCallbacks;
  readonly onCheckout: (handoff: SeatLayerPickerCheckoutHandoff) => void | Promise<void>;
  readonly onClose?: () => void | Promise<void>;
  readonly hapticAdapter?: SeatLayerPickerHapticAdapter;
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  /** False while a controlled modal retains an invisible cleanup scope. */
  readonly presentationActive?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

type CallbackLease = Readonly<{
  readonly controller: SeatLayerPickerScopeValue['controller'];
  readonly scopeSessionId: number;
  readonly runtimeSessionId: string;
}>;

function callbackLease(scope: SeatLayerPickerScopeValue): CallbackLease {
  return Object.freeze({
    controller: scope.controller,
    scopeSessionId: scope.sessionId,
    runtimeSessionId: scope.snapshot?.sessionId ?? '',
  });
}

/** Shared scope consumer only: wrappers retain scope, observer, and close ownership. */
export function SeatLayerPickerScopedContent(props: SeatLayerPickerScopedContentProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const scopeRef = useRef(scope);
  const callbacksRef = useRef(props.callbacks);
  const checkoutRef = useRef(props.onCheckout);
  useLayoutEffect(() => {
    scopeRef.current = scope;
    callbacksRef.current = props.callbacks;
    checkoutRef.current = props.onCheckout;
  }, [props.callbacks, props.onCheckout, scope]);

  const report = useCallback((lease: CallbackLease, error: unknown) => {
    const current = scopeRef.current;
    if (
      current.controller !== lease.controller ||
      current.sessionId !== lease.scopeSessionId ||
      (current.snapshot?.sessionId ?? '') !== lease.runtimeSessionId
    ) return;
    try { current.reportError(error); } catch { /* Callback reporting never escapes native chrome. */ }
  }, []);
  const notify = useCallback(<T,>(callback: ((value: T) => unknown) | undefined, value: T) => {
    const lease = callbackLease(scopeRef.current);
    invokeSeatLayerPickerCallback(callback as ((value: T) => void) | undefined, value, (error) => report(lease, error));
  }, [report]);
  const ready = useCallback((value: Parameters<NonNullable<SeatLayerPickerCallbacks['onReady']>>[0]) => {
    notify(callbacksRef.current?.onReady, value);
  }, [notify]);
  const selected = useCallback((value: Parameters<NonNullable<SeatLayerPickerCallbacks['onSeatSelected']>>[0]) => {
    notify(callbacksRef.current?.onSeatSelected, value);
  }, [notify]);
  const removed = useCallback((value: Parameters<NonNullable<SeatLayerPickerCallbacks['onSeatRemoved']>>[0]) => {
    notify(callbacksRef.current?.onSeatRemoved, value);
  }, [notify]);
  const seatView = useCallback((value: Parameters<NonNullable<SeatLayerPickerCallbacks['onSeatViewOpened']>>[0]) => {
    notify(callbacksRef.current?.onSeatViewOpened, value);
  }, [notify]);
  const focused = useCallback((value: Parameters<NonNullable<SeatLayerPickerCallbacks['onSectionFocused']>>[0]) => {
    notify(callbacksRef.current?.onSectionFocused, value);
  }, [notify]);
  const onCheckout = useCallback(async (handoff: SeatLayerPickerCheckoutHandoff) => {
    notify(callbacksRef.current?.onContinue, handoff);
    return checkoutRef.current(handoff);
  }, [notify]);

  return (
    <SeatLayerPickerAdaptiveLayout
      builders={props.builders}
      hapticAdapter={props.hapticAdapter}
      onCheckout={onCheckout}
      onClose={props.onClose}
      onReady={ready}
      onSeatSelected={selected}
      onSeatRemoved={removed}
      onSeatViewOpened={seatView}
      onSectionFocused={focused}
      options={props.options}
      safeAreaInsets={props.safeAreaInsets}
      style={props.style}
      presentationActive={props.presentationActive}
    />
  );
}
