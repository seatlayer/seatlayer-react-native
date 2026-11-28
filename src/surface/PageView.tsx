import React, { useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { BridgeProfile } from '../bridge/profile';
import { SeatLayerError } from '../errors';
import { SeatLayerRenderer, type SeatLayerRendererController } from '../SeatLayerRenderer';
import type { ReadyInfo, SeatLayerSurfaceConfiguration } from '../types';
import type { SeatLayerPageController, SeatLayerPageHold } from './pageController';

export interface SeatLayerPageViewProps<Configuration extends SeatLayerSurfaceConfiguration> {
  readonly controller: Pick<
    SeatLayerPageController<SeatLayerPageHold>,
    'beginHandshake' | 'session' | 'detach' | 'pageLost'
  >;
  readonly configuration: Configuration;
  /** Equal keys open the same page the same way: a new render keeps it. */
  readonly configurationKey: string;
  /** The page's address on the map's origin. */
  readonly page: string;
  /** What the page boots with. Read when the page starts. */
  readonly profile: BridgeProfile;
  readonly backgroundColor?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly onReady?: (info: ReadyInfo) => void;
  readonly onLoadError?: (error: SeatLayerError) => void;
  /** The system ended the page. The controller has already let it go. */
  readonly onPageLost?: () => void;
}

/**
 * A page of its own in a web view, on the event's renderer. Give it a
 * definite size. A new render with an equal configuration keeps the page;
 * the newest access provider is the one asked.
 */
export function SeatLayerPageView<Configuration extends SeatLayerSurfaceConfiguration>(
  props: SeatLayerPageViewProps<Configuration>,
): React.ReactElement {
  const latest = useRef(props);
  latest.current = props;
  const configuration = useMemo<Configuration>(() => {
    const given = latest.current.configuration;
    if (given.buyerAccessTokenProvider === undefined) return { ...given };
    return {
      ...given,
      buyerAccessTokenProvider: (context) => {
        const provider = latest.current.configuration.buyerAccessTokenProvider;
        if (provider === undefined) throw new Error('No buyer access provider.');
        return provider(context);
      },
    };
  }, [props.configurationKey]);
  const controller = props.controller;
  const renderer = useMemo<SeatLayerRendererController<Configuration>>(() => ({
    beginHandshake: (transport, given) =>
      controller.beginHandshake(transport, given, latest.current.profile),
    ingestRaw: (input) => controller.session.ingestRaw(input),
    failWithTransport: (detail, cause) => controller.session.failWithTransport(detail, cause),
  }), [controller]);
  return (
    <View collapsable={false} style={[{ flex: 1, backgroundColor: props.backgroundColor }, props.style]}>
      <SeatLayerRenderer<Configuration>
        controller={renderer}
        configuration={configuration}
        page={props.page}
        testID={props.testID}
        accessibilityLabel={props.accessibilityLabel}
        onReady={(info) => latest.current.onReady?.(info)}
        onLoadError={(error) => latest.current.onLoadError?.(error)}
        onUnmount={() => controller.detach()}
        onPageLost={() => {
          controller.pageLost();
          latest.current.onPageLost?.();
        }}
      />
    </View>
  );
}
