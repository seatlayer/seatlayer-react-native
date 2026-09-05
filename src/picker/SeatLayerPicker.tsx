import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { SeatLayerConfiguration } from '../types';
import { SeatLayerPickerScopedContent } from './SeatLayerPickerScopedContent';
import { SeatLayerPickerCallbackObserver } from './SeatLayerPickerCallbackObserver';
import { SeatLayerPickerHoldOwnershipObserver } from './holdOwnershipObserver';
import { SeatLayerPickerBoldTextRoot } from './boldText';
import type { SeatLayerPickerBuilders } from './builders';
import type { SeatLayerPickerCallbacks } from './callbacks';
import { SeatLayerPickerCloseLifecycle } from './closeLifecycle';
import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerHapticAdapter } from './hapticPlayer';
import type { SeatLayerPickerCheckoutHandoff } from './models';
import {
  resolveSeatLayerPickerOptions,
  seatLayerPickerBridgeConfigFromOptions,
  type SeatLayerPickerOptions,
} from './options';
import {
  SeatLayerPickerScope,
  useSeatLayerPickerScope,
} from './SeatLayerPickerScope';
import type { SeatLayerPickerScopeStringProps } from './scopeStrings';
import type { SeatLayerPickerSafeAreaInsetInput } from './safeAreaInsets';
import type { SeatLayerPickerThemeStyles } from './styles';
import type { SeatLayerPickerThemeOptions, SeatLayerThemeMode } from './theme';

export interface SeatLayerPickerProps extends SeatLayerPickerScopeStringProps {
  readonly configuration: SeatLayerConfiguration;
  readonly onCheckout: (handoff: SeatLayerPickerCheckoutHandoff) => void | Promise<void>;
  readonly controller?: SeatLayerPickerController;
  readonly options?: SeatLayerPickerOptions;
  readonly themeMode?: SeatLayerThemeMode;
  readonly themeOptions?: Omit<SeatLayerPickerThemeOptions, 'themeMode' | 'systemThemeMode'>;
  readonly styles?: SeatLayerPickerThemeStyles;
  readonly builders?: SeatLayerPickerBuilders;
  readonly callbacks?: SeatLayerPickerCallbacks;
  readonly hapticAdapter?: SeatLayerPickerHapticAdapter;
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly onClose?: () => void | Promise<void>;
}

type CloseFlight = Readonly<{ readonly epoch: number; readonly promise: Promise<void> }>;


/**
 * Public ready-made embedded picker composition. Modal presentation remains a
 * separate owner so this surface never installs a second Back or close route.
 */
export function SeatLayerPicker(props: SeatLayerPickerProps): React.ReactElement {
  const resolvedOptions = useMemo(
    () => resolveSeatLayerPickerOptions(props.options),
    [props.options],
  );
  const bridgeConfig = useMemo(
    () => seatLayerPickerBridgeConfigFromOptions(resolvedOptions),
    [resolvedOptions],
  );
  return (
    <SeatLayerPickerScope
      configuration={props.configuration}
      controller={props.controller}
      bridgeConfig={bridgeConfig}
      readOnly={resolvedOptions.readOnly}
      refreshOnResume={resolvedOptions.refreshOnResume}
      onChartLoad={props.callbacks?.onChartLoad}
      themeMode={props.themeMode}
      themeOptions={props.themeOptions}
      styles={props.styles}
      pricing={resolvedOptions.pricing}
      locale={props.locale}
      strings={props.strings}
    >
      <SeatLayerPickerCallbackObserver callbacks={props.callbacks} />
      <SeatLayerPickerHoldOwnershipObserver />
      <SeatLayerPickerBoldTextRoot />
      <SeatLayerPickerEmbeddedLayout
        builders={props.builders}
        callbacks={props.callbacks}
        hapticAdapter={props.hapticAdapter}
        onCheckout={props.onCheckout}
        onClose={props.onClose}
        options={props.options}
        safeAreaInsets={props.safeAreaInsets}
        style={props.style}
        testID={props.testID}
      />
    </SeatLayerPickerScope>
  );
}

function SeatLayerPickerEmbeddedLayout({
  builders,
  callbacks,
  hapticAdapter,
  onCheckout,
  onClose,
  options,
  safeAreaInsets,
  style,
  testID,
}: Pick<
  SeatLayerPickerProps,
  | 'builders'
  | 'callbacks'
  | 'hapticAdapter'
  | 'onCheckout'
  | 'onClose'
  | 'safeAreaInsets'
  | 'style'
  | 'testID'
> & { readonly options?: SeatLayerPickerOptions }): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const scopeRef = useRef(scope);
  const callbacksRef = useRef(callbacks);
  const closeRef = useRef(onClose);
  const mountedRef = useRef(false);
  const closeEpochRef = useRef(0);
  const notifiedCloseEpochRef = useRef<number | undefined>(undefined);
  const closeFlightRef = useRef<CloseFlight | undefined>(undefined);
  const lifecycleRef = useRef<SeatLayerPickerCloseLifecycle | undefined>(undefined);
  if (lifecycleRef.current === undefined) {
    lifecycleRef.current = new SeatLayerPickerCloseLifecycle({
      getScope: () => scopeRef.current,
      getCallbacks: () => callbacksRef.current,
    });
  }
  const runtimeSession = scope.snapshot?.sessionId ?? '';
  useLayoutEffect(() => {
    scopeRef.current = scope;
    callbacksRef.current = callbacks;
    closeRef.current = onClose;
  }, [callbacks, onCheckout, onClose, scope]);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useLayoutEffect(() => {
    const lifecycle = lifecycleRef.current!;
    closeEpochRef.current += 1;
    notifiedCloseEpochRef.current = undefined;
    closeFlightRef.current = undefined;
    lifecycle.reset();
    return () => lifecycle.retire();
  }, [runtimeSession, scope.controller, scope.sessionId]);

  const isCurrentCloseEpoch = useCallback((epoch: number): boolean =>
    mountedRef.current && closeEpochRef.current === epoch, []);
  const requestClose = useCallback((): Promise<void> => {
    const epoch = closeEpochRef.current;
    if (notifiedCloseEpochRef.current === epoch) return Promise.resolve();
    const existing = closeFlightRef.current;
    if (existing?.epoch === epoch) return existing.promise;
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => { settle = resolve; });
    const flight = Object.freeze({ epoch, promise });
    closeFlightRef.current = flight;
    void lifecycleRef.current!.request('closeButton').then(async (closed) => {
      if (!closed || !isCurrentCloseEpoch(epoch)) return;
      notifiedCloseEpochRef.current = epoch;
      try {
        await closeRef.current?.();
      } catch (error) {
        if (isCurrentCloseEpoch(epoch)) scopeRef.current.reportError(error);
      }
    }).catch((error) => {
      if (isCurrentCloseEpoch(epoch)) scopeRef.current.reportError(error);
    }).finally(() => {
      if (closeFlightRef.current === flight) closeFlightRef.current = undefined;
      settle();
    });
    return promise;
  }, [isCurrentCloseEpoch]);


  return (
    <View testID={testID} style={rootStyle}>
      <SeatLayerPickerScopedContent
        builders={builders}
        callbacks={callbacks}
        hapticAdapter={hapticAdapter}
        onCheckout={onCheckout}
        onClose={onClose === undefined ? undefined : requestClose}
        options={options}
        safeAreaInsets={safeAreaInsets}
        style={style}
      />
    </View>
  );
}

const rootStyle = Object.freeze({ flex: 1 });
