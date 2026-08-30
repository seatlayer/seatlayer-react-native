import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { SeatLayerConfiguration } from '../types';
import type { SeatLayerPickerBuilders } from './builders';
import type { SeatLayerPickerCallbacks, SeatLayerPickerCloseReason } from './callbacks';
import { SeatLayerPickerCallbackObserver } from './SeatLayerPickerCallbackObserver';
import { SeatLayerPickerCloseLifecycle } from './closeLifecycle';
import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerHapticAdapter } from './hapticPlayer';
import {
  seatLayerPickerModalMaximumHeight,
  seatLayerPickerModalMaximumWidth,
  seatLayerPickerModalPresentationInset,
  resolveSeatLayerPickerModalPresentation,
  type SeatLayerPickerModalPresentation,
} from './modalPresentation';
import type { SeatLayerPickerCheckoutHandoff } from './models';
import {
  resolveSeatLayerPickerOptions,
  seatLayerPickerBridgeConfigFromOptions,
  type SeatLayerPickerOptions,
} from './options';
import {
  SeatLayerPickerScope,
  SeatLayerPickerScopeReprovider,
  useSeatLayerPickerScope,
} from './SeatLayerPickerScope';
import { SeatLayerPickerScopedContent } from './SeatLayerPickerScopedContent';
import type { SeatLayerPickerSafeAreaInsetInput } from './safeAreaInsets';
import type { SeatLayerPickerScopeStringProps } from './scopeStrings';
import type { SeatLayerPickerThemeStyles } from './styles';
import type { SeatLayerPickerThemeOptions, SeatLayerThemeMode } from './theme';

export interface SeatLayerPickerModalProps extends SeatLayerPickerScopeStringProps {
  readonly visible: boolean;
  readonly configuration: SeatLayerConfiguration;
  readonly onCheckout: (handoff: SeatLayerPickerCheckoutHandoff) => void | Promise<void>;
  readonly onRequestClose: (reason: SeatLayerPickerCloseReason) => void | Promise<void>;
  readonly presentation?: SeatLayerPickerModalPresentation;
  readonly barrierDismissible?: boolean;
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
}

type ModalStage = Readonly<{
  readonly scopeKey: number | undefined;
  readonly cleaningKey: number | undefined;
}>;
type CloseFlight = Readonly<{ readonly epoch: number; readonly promise: Promise<boolean> }>;

/**
 * Controlled modal ownership deliberately outlives visibility by one close
 * lease. A reopen while that lease is releasing gets a new keyed scope only
 * after the old completion has proved it still owns the stage.
 */
export function SeatLayerPickerModal(props: SeatLayerPickerModalProps): React.ReactElement | null {
  const nextScopeKey = useRef(props.visible ? 1 : 0);
  const desiredVisible = useRef(props.visible);
  const [stage, setStage] = useState<ModalStage>(() => Object.freeze({
    scopeKey: props.visible ? nextScopeKey.current : undefined,
    cleaningKey: undefined,
  }));
  const resolved = useMemo(() => resolveSeatLayerPickerOptions(props.options), [props.options]);
  const bridgeConfig = useMemo(
    () => seatLayerPickerBridgeConfigFromOptions(resolved),
    [resolved],
  );

  useLayoutEffect(() => {
    desiredVisible.current = props.visible;
    if (props.visible) {
      setStage((current) => current.scopeKey === undefined
        ? Object.freeze({ scopeKey: ++nextScopeKey.current, cleaningKey: undefined })
        : current);
      return;
    }
    setStage((current) => current.scopeKey === undefined || current.cleaningKey !== undefined
      ? current
      : Object.freeze({ scopeKey: current.scopeKey, cleaningKey: current.scopeKey }));
  }, [props.visible]);

  const finishCleanup = useCallback((scopeKey: number) => {
    setStage((current) => {
      if (current.scopeKey !== scopeKey) return current;
      return desiredVisible.current
        ? Object.freeze({ scopeKey: ++nextScopeKey.current, cleaningKey: undefined })
        : Object.freeze({ scopeKey: undefined, cleaningKey: undefined });
    });
  }, []);

  if (stage.scopeKey === undefined) return null;
  const renderedVisible = props.visible && stage.cleaningKey === undefined;
  return (
    <SeatLayerPickerScope
      key={stage.scopeKey}
      configuration={props.configuration}
      controller={props.controller}
      bridgeConfig={bridgeConfig}
      readOnly={resolved.readOnly}
      refreshOnResume={resolved.refreshOnResume}
      onChartLoad={props.callbacks?.onChartLoad}
      themeMode={props.themeMode}
      themeOptions={props.themeOptions}
      styles={props.styles}
      pricing={resolved.pricing}
      locale={props.locale}
      strings={props.strings}
    >
      <SeatLayerPickerCallbackObserver callbacks={props.callbacks} />
      <ModalBody
        {...props}
        cleanupKey={stage.scopeKey}
        onFinished={finishCleanup}
        rawOptions={props.options}
        renderedVisible={renderedVisible}
      />
    </SeatLayerPickerScope>
  );
}

function ModalBody(
  props: SeatLayerPickerModalProps & {
    readonly cleanupKey: number;
    readonly onFinished: (scopeKey: number) => void;
    readonly rawOptions?: SeatLayerPickerOptions;
    readonly renderedVisible: boolean;
  },
): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const { width } = useWindowDimensions();
  const presentation = resolveSeatLayerPickerModalPresentation(props.presentation, width);
  const scopeRef = useRef(scope);
  const callbacksRef = useRef(props.callbacks);
  const hostCloseRef = useRef(props.onRequestClose);
  const mountedRef = useRef(false);
  const epochRef = useRef(0);
  const closeFlightRef = useRef<CloseFlight | undefined>(undefined);
  const hostNotifiedEpochRef = useRef<number | undefined>(undefined);
  const lifecycleRef = useRef(new SeatLayerPickerCloseLifecycle({
    getScope: () => scopeRef.current,
    getCallbacks: () => callbacksRef.current,
  }));
  const runtimeSessionId = scope.snapshot?.sessionId ?? '';

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useLayoutEffect(() => {
    scopeRef.current = scope;
    callbacksRef.current = props.callbacks;
    hostCloseRef.current = props.onRequestClose;
  }, [props.callbacks, props.onRequestClose, scope]);
  useLayoutEffect(() => {
    const lifecycle = lifecycleRef.current;
    epochRef.current += 1;
    closeFlightRef.current = undefined;
    hostNotifiedEpochRef.current = undefined;
    lifecycle.reset();
    return () => lifecycle.retire();
  }, [runtimeSessionId, scope.controller, scope.sessionId]);

  const isCurrent = useCallback((epoch: number): boolean =>
    mountedRef.current && epochRef.current === epoch, []);
  const reportHostFailure = useCallback((epoch: number, error: unknown) => {
    if (!isCurrent(epoch)) return;
    try { scopeRef.current.reportError(error); } catch { /* Host reports are observational. */ }
  }, [isCurrent]);
  const beginClose = useCallback((reason: SeatLayerPickerCloseReason, notifyHost: boolean): Promise<boolean> => {
    const epoch = epochRef.current;
    const existing = closeFlightRef.current;
    if (existing?.epoch === epoch) return existing.promise;
    const promise = lifecycleRef.current.request(reason).then((closed) => {
      if (!closed || !isCurrent(epoch) || !notifyHost || hostNotifiedEpochRef.current === epoch) {
        return closed && isCurrent(epoch);
      }
      hostNotifiedEpochRef.current = epoch;
      try {
        void Promise.resolve(hostCloseRef.current(reason)).catch((error) => reportHostFailure(epoch, error));
      } catch (error) {
        reportHostFailure(epoch, error);
      }
      return true;
    }, (error) => {
      reportHostFailure(epoch, error);
      return false;
    });
    const flight = Object.freeze({ epoch, promise });
    closeFlightRef.current = flight;
    void promise.finally(() => {
      if (closeFlightRef.current === flight) closeFlightRef.current = undefined;
    });
    return promise;
  }, [isCurrent, reportHostFailure]);

  // Native Modal can retain children while invisible. The scope remains only
  // for release; its adaptive content surrenders global native ownership first.
  useEffect(() => {
    if (props.renderedVisible) return;
    const epoch = epochRef.current;
    void beginClose('programmatic', false).finally(() => {
      if (isCurrent(epoch)) props.onFinished(props.cleanupKey);
    });
  }, [beginClose, isCurrent, props.cleanupKey, props.onFinished, props.renderedVisible, runtimeSessionId, scope.controller, scope.sessionId]);

  const request = useCallback(async (reason: SeatLayerPickerCloseReason) => {
    const currentScope = scopeRef.current;
    if (currentScope.canHandleBack()) {
      await currentScope.back();
      return;
    }
    await beginClose(reason, true);
  }, [beginClose]);
  const content = (
    <SeatLayerPickerScopedContent
      builders={props.builders}
      callbacks={props.callbacks}
      hapticAdapter={props.hapticAdapter}
      onCheckout={props.onCheckout}
      onClose={() => beginClose('closeButton', true).then(() => undefined)}
      options={props.rawOptions}
      safeAreaInsets={props.safeAreaInsets}
      style={props.style}
      presentationActive={props.renderedVisible}
    />
  );
  const dialog = presentation === 'dialog';
  const barrierDismissible = props.barrierDismissible === true;
  const usesHostInsets = props.safeAreaInsets !== undefined;
  const boundedContent = dialog ? (
    <View pointerEvents="box-none" style={dialogBoundsStyle}>
      <View testID="seatlayer-modal-card" pointerEvents="auto" style={[
        dialogCardStyle,
        {
          backgroundColor: scope.resolvedTheme.colors.surface,
          borderRadius: scope.resolvedTheme.radii.card,
        },
      ]}>
        {content}
      </View>
    </View>
  ) : content;
  const safeContent = usesHostInsets ? boundedContent : (
    <SafeAreaView style={[
      modalRootStyle,
      dialog ? undefined : { backgroundColor: scope.resolvedTheme.colors.surface },
    ]}>
      {boundedContent}
    </SafeAreaView>
  );
  return (
    <Modal
      visible={props.renderedVisible}
      transparent={dialog}
      animationType={dialog ? 'fade' : 'slide'}
      presentationStyle={dialog ? 'overFullScreen' : 'fullScreen'}
      statusBarTranslucent={usesHostInsets}
      onRequestClose={() => { void request('systemBack'); }}
    >
      <SeatLayerPickerScopeReprovider>
        <View testID={props.testID} style={modalRootStyle}>
          {dialog ? (
            <View style={modalRootStyle}>
              <Pressable
                testID="seatlayer-modal-barrier"
                accessible={barrierDismissible}
                accessibilityElementsHidden={!barrierDismissible}
                accessibilityLabel={barrierDismissible ? scope.strings.translate('close') : undefined}
                accessibilityRole={barrierDismissible ? 'button' : undefined}
                onPress={barrierDismissible ? () => { void request('barrier'); } : undefined}
                style={barrierStyle}
              />
              {safeContent}
            </View>
          ) : safeContent}
        </View>
      </SeatLayerPickerScopeReprovider>
    </Modal>
  );
}

const modalRootStyle = Object.freeze({ flex: 1 });
const barrierStyle = Object.freeze({
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: '#0000008A',
});
const dialogBoundsStyle = Object.freeze({
  flex: 1,
  justifyContent: 'center' as const,
  padding: seatLayerPickerModalPresentationInset,
});
const dialogCardStyle = Object.freeze({
  alignSelf: 'center' as const,
  width: '100%' as const,
  maxWidth: seatLayerPickerModalMaximumWidth,
  maxHeight: seatLayerPickerModalMaximumHeight,
  flex: 1,
  overflow: 'hidden' as const,
});
