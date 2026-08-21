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
import { seatLayerMobileOrigin, seatLayerMobilePageUrl, type ReadyInfo, type SeatLayerConfiguration } from './types';
import type { SeatLayerController } from './controller';

export interface SeatLayerViewProps {
  controller: SeatLayerController;
  configuration: SeatLayerConfiguration;
  style?: StyleProp<ViewStyle>;
  /**
   * Change this to force a clean WebView + bridge reload without changing
   * configuration.
   */
  reloadKey?: string | number;
  testID?: string;
  accessibilityLabel?: string;
  onReady?: (info: ReadyInfo) => void;
  onLoadError?: (error: SeatLayerError) => void;
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

export function SeatLayerView({
  controller,
  configuration,
  style,
  reloadKey,
  testID,
  accessibilityLabel,
  onReady,
  onLoadError,
}: SeatLayerViewProps): React.ReactElement {
  const webView = useRef<WebViewHandle | null>(null);
  const onReadyRef = useRef(onReady);
  const onLoadErrorRef = useRef(onLoadError);
  onReadyRef.current = onReady;
  onLoadErrorRef.current = onLoadError;
  // Credentials and provider functions must never be serialized into a React
  // key. Depending on the configuration object reloads safely when either is
  // replaced, without putting the token in a string, log, or native view key.
  const viewKey = `${configurationIdentity(configuration)}:${String(
    reloadKey ?? 'seatlayer',
  )}`;

  useLayoutEffect(() => {
    const transport = new ReactNativeWebViewTransport(() => webView.current);
    let active = true;
    controller.beginHandshake(transport, configuration).then(
      (info) => {
        if (active) onReadyRef.current?.(info);
      },
      (error: unknown) => {
        if (!active) return;
        onLoadErrorRef.current?.(
          error instanceof SeatLayerError
            ? error
            : SeatLayerError.transport('SeatLayer handshake failed.', error),
        );
      },
    );
    return () => {
      active = false;
      controller.disconnect(
        SeatLayerError.transport('SeatLayer view unmounted.'),
        false,
      );
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
      mixedContentMode="never"
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
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
