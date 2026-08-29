import React, { useLayoutEffect, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';

import type { BridgeTransport } from './bridge/client';
import { encodeEnvelope, type Envelope } from './bridge/envelope';
import { SeatLayerError } from './errors';
import {
  seatLayerMobileOrigin,
  seatLayerMobilePageUrl,
  type ReadyInfo,
  type SeatLayerConfiguration,
} from './types';
import {
  beginSeatLayerRendererHandshake,
  SeatLayerRendererHandshakeLease,
} from './rendererHandshake';
import { captureSeatLayerRendererUnmount } from './rendererCleanup';

export interface SeatLayerRendererController {
  beginHandshake(
    transport: BridgeTransport,
    configuration: SeatLayerConfiguration,
  ): Promise<ReadyInfo>;
  ingestRaw(input: unknown): void;
  failWithTransport(detail: string, cause?: unknown): void;
}

export interface SeatLayerRendererProps {
  controller: SeatLayerRendererController;
  configuration: SeatLayerConfiguration;
  style?: StyleProp<ViewStyle>;
  reloadKey?: string | number;
  testID?: string;
  accessibilityLabel?: string;
  onReady?: (info: ReadyInfo) => void;
  onLoadError?: (error: SeatLayerError) => void;
  onUnmount?: () => void;
}

interface WebViewHandle {
  injectJavaScript(script: string): void;
}

const NativeWebView = WebView as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebViewHandle>
>;

const configurationIds = new WeakMap<object, number>();
let nextConfigurationId = 0;

function configurationIdentity(configuration: object): number {
  const existing = configurationIds.get(configuration);
  if (existing !== undefined) return existing;
  nextConfigurationId += 1;
  configurationIds.set(configuration, nextConfigurationId);
  return nextConfigurationId;
}

function invokeSeatLayerRendererCallback<Argument>(
  callback: ((argument: Argument) => void) | undefined,
  argument: Argument,
): void {
  if (callback === undefined) return;
  try {
    const result = callback(argument) as unknown;
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    // Consumer callbacks are notifications and must not reject the renderer.
  }
}

/** Internal native renderer shared by the raw chart and protocol-2 picker chart. */
export function SeatLayerRenderer({
  controller,
  configuration,
  style,
  reloadKey,
  testID,
  accessibilityLabel,
  onReady,
  onLoadError,
  onUnmount,
}: SeatLayerRendererProps): React.ReactElement {
  const webView = useRef<WebViewHandle | null>(null);
  const onReadyRef = useRef(onReady);
  const onLoadErrorRef = useRef(onLoadError);
  const onUnmountRef = useRef(onUnmount);
  onReadyRef.current = onReady;
  onLoadErrorRef.current = onLoadError;
  onUnmountRef.current = onUnmount;
  const viewKey = `${configurationIdentity(configuration)}:${String(
    reloadKey ?? 'seatlayer',
  )}`;

  useLayoutEffect(() => {
    const transport = new ReactNativeWebViewTransport(() => webView.current);
    const disconnect = captureSeatLayerRendererUnmount(onUnmountRef.current);
    const lease = new SeatLayerRendererHandshakeLease({
      begin: () => beginSeatLayerRendererHandshake(controller, transport, configuration),
      disconnect,
      onReady: (info) => invokeSeatLayerRendererCallback(onReadyRef.current, info),
      onLoadError: (error) =>
        invokeSeatLayerRendererCallback(
          onLoadErrorRef.current,
          error instanceof SeatLayerError
            ? error
            : SeatLayerError.transport('SeatLayer handshake failed.', error),
        ),
      schedule: (callback) => setTimeout(callback, 0),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    lease.setup();
    return () => {
      lease.cleanup();
    };
  }, [configuration, controller, reloadKey]);

  const onMessage = (event: WebViewMessageEvent): void => {
    if (event.nativeEvent.url === seatLayerMobilePageUrl) {
      controller.ingestRaw(event.nativeEvent.data);
    }
  };

  const reportLoadFailure = (message: string): void => {
    controller.failWithTransport(message);
  };

  return (
    <NativeWebView
      key={viewKey}
      ref={webView}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[styles.webView, style]}
      source={{ uri: seatLayerMobilePageUrl }}
      originWhitelist={[seatLayerMobileOrigin]}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode='never'
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      bounces={false}
      overScrollMode='never'
      onMessage={onMessage}
      onError={(event) =>
        reportLoadFailure(
          `SeatLayer page load failed: ${event.nativeEvent.description}`,
        )
      }
      onHttpError={(event) =>
        reportLoadFailure(
          `SeatLayer page returned HTTP ${event.nativeEvent.statusCode}.`,
        )
      }
      onShouldStartLoadWithRequest={(request) =>
        request.url === seatLayerMobilePageUrl
      }
    />
  );
}

class ReactNativeWebViewTransport implements BridgeTransport {
  constructor(
    private readonly resolveWebView: () => WebViewHandle | null,
  ) {}

  send(envelope: Envelope): void {
    const wire = encodeEnvelope(envelope);
    const literal = JSON.stringify(wire)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    this.resolveWebView()?.injectJavaScript(
      `window.__slBridge && window.__slBridge.recv(${literal}); true;`,
    );
  }
}

const styles = StyleSheet.create({
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
