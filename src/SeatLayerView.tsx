import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';

import type { BridgeTransport } from './bridge/client';
import { encodeEnvelope, type Envelope } from './bridge/envelope';
import { SeatLayerError } from './errors';
import { seatLayerWebDocument } from './generated/webDocument';
import type { ReadyInfo, SeatLayerConfiguration } from './types';
import type { SeatLayerController } from './controller';

const documentBaseUrl = 'https://seatlayer.local/';

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
  const configurationKey = useMemo(
    () => JSON.stringify(configuration),
    [configuration],
  );
  const viewKey = `${configurationKey}:${String(reloadKey ?? '')}`;

  useLayoutEffect(() => {
    const transport = new ReactNativeWebViewTransport(() => webView.current);
    let active = true;
    controller.beginHandshake(transport, configuration).then(
      (info) => {
        if (active) onReady?.(info);
      },
      (error: unknown) => {
        if (!active) return;
        onLoadError?.(
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
  }, [configurationKey, controller, onLoadError, onReady, reloadKey]);

  const onMessage = (event: WebViewMessageEvent): void => {
    controller.ingestRaw(event.nativeEvent.data);
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
      source={{ html: seatLayerWebDocument, baseUrl: documentBaseUrl }}
      originWhitelist={['*']}
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
        request.url === 'about:blank' ||
        request.url.startsWith(documentBaseUrl) ||
        request.url.startsWith('data:text/html')
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
