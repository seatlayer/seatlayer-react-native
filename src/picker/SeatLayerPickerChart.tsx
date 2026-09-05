import React, { useEffect, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { SeatLayerRenderer } from '../SeatLayerRenderer';
import type { JsonObject } from '../json';
import type { ReadyInfo } from '../types';
import {
  createSeatLayerPickerChartRendererController,
  disconnectSeatLayerPickerChartRenderer,
} from './chartBridge';
import { SeatLayerPickerChartThemeSync, type SeatLayerPickerChartTheme } from './chartThemeSync';
import { SeatLayerPickerEffectSlot } from './effectSlot';
import {
  tryCreateSeatLayerPickerChartBoot,
  type SeatLayerPickerChartBoot,
  type SeatLayerPickerChartBootResult,
} from './chartBoot';
import { invokeSeatLayerPickerCallback } from './callback';
import { useSeatLayerPickerBlockedRegionSurface } from './blockedRegionsContext';
import {
  type SeatLayerPickerScopeValue,
  useSeatLayerPickerScope,
} from './SeatLayerPickerScope';

export interface SeatLayerPickerChartProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly onReady?: (info: ReadyInfo) => void;
}

function PickerChartInstance({
  style,
  testID,
  accessibilityLabel,
  onReady,
}: SeatLayerPickerChartProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const bootRef = useRef<SeatLayerPickerChartBootResult | undefined>(undefined);
  if (bootRef.current === undefined) {
    bootRef.current = tryCreateSeatLayerPickerChartBoot(
      scope.configuration,
      scope.bridgeConfig,
      scope.resolvedTheme.mapTheme as JsonObject,
      scope.resolvedTheme.themeMode,
      scope.readOnly,
    );
  }
  const bootResult = bootRef.current!;
  if (bootResult.boot === undefined) {
    return <PickerChartBootError scope={scope} style={style} error={bootResult.error} />;
  }
  return (
    <PickerChartReady
      scope={scope}
      boot={bootResult.boot}
      style={style}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onReady={onReady}
    />
  );
}

function PickerChartBootError({
  scope,
  style,
  error,
}: {
  readonly scope: SeatLayerPickerScopeValue;
  readonly style: StyleProp<ViewStyle>;
  readonly error: unknown;
}): React.ReactElement {
  useEffect(() => { scope.reportError(error); }, [error, scope.reportError]);
  return <View style={[{ flex: 1, backgroundColor: scope.resolvedTheme.mapTheme.background }, style]} />;
}

function PickerChartReady({
  scope,
  boot,
  style,
  testID,
  accessibilityLabel,
  onReady,
}: {
  readonly scope: SeatLayerPickerScopeValue;
  readonly boot: SeatLayerPickerChartBoot;
  readonly style: StyleProp<ViewStyle>;
  readonly testID: string | undefined;
  readonly accessibilityLabel: string | undefined;
  readonly onReady: ((info: ReadyInfo) => void) | undefined;
}): React.ReactElement {
  const desiredMapTheme = useMemo(
    () => scope.resolvedTheme.mapTheme as JsonObject,
    [scope.resolvedTheme],
  );
  const desiredThemeKey = JSON.stringify({
    mode: scope.resolvedTheme.themeMode,
    mapTheme: desiredMapTheme,
  });
  const latestTheme = useRef<SeatLayerPickerChartTheme>({
    mode: scope.resolvedTheme.themeMode,
    mapTheme: desiredMapTheme as JsonObject,
  });
  latestTheme.current = {
    mode: scope.resolvedTheme.themeMode,
    mapTheme: desiredMapTheme as JsonObject,
  };
  const themeSlotRef = useRef(
    new SeatLayerPickerEffectSlot<SeatLayerPickerChartThemeSync>(),
  );
  useEffect(() => {
    const sync = new SeatLayerPickerChartThemeSync({
      mode: scope.resolvedTheme.themeMode,
      mapTheme: scope.resolvedTheme.mapTheme as JsonObject,
    });
    const release = themeSlotRef.current.install(sync);
    sync.setDesired(latestTheme.current);
    if (scope.isReady) sync.markReady();
    return release;
  }, [scope.controller]);
  const surface = useSeatLayerPickerBlockedRegionSurface();
  const bridgeController = useMemo(
    () => createSeatLayerPickerChartRendererController(
      scope.controller,
      boot.bridgeConfig,
    ),
    [boot.bridgeConfig, scope.controller],
  );

  useEffect(() => {
    const themeSync = themeSlotRef.current.current;
    if (themeSync === undefined) return;
    themeSync.setDesired(latestTheme.current);
    if (scope.isReady) themeSync.markReady();
    void themeSync.flush((theme) =>
      scope.controller.setThemeMode(theme.mode, theme.mapTheme),
    ).catch(scope.reportError);
  }, [desiredThemeKey, scope.controller, scope.isReady, scope.reportError]);

  return (
    // 2.4: the map surface's own rectangle. Every piece of chrome standing on
    // it reports its rect measured from this view's top-left, which is the
    // frame `picker.setBlockedRegions` and `picker.setViewportInsets` share.
    <View
      collapsable={false}
      onLayout={surface.onLayout}
      ref={surface.ref as never}
      style={[{ flex: 1, backgroundColor: scope.resolvedTheme.mapTheme.background }, style]}
    >
      <SeatLayerRenderer
        controller={bridgeController}
        configuration={boot.configuration}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        onReady={(info) => {
          scope.markReady(info);
          const themeSync = themeSlotRef.current.current;
          if (themeSync !== undefined) {
            themeSync.markReady();
            void themeSync.flush((theme) =>
              scope.controller.setThemeMode(theme.mode, theme.mapTheme),
            ).catch(scope.reportError);
          }
          invokeSeatLayerPickerCallback(onReady, info, scope.reportError);
        }}
        onLoadError={scope.reportError}
        onUnmount={() => disconnectSeatLayerPickerChartRenderer(scope.controller)}
      />
    </View>
  );
}

/** Protocol-2 chart surface for use inside SeatLayerPickerScope. */
export function SeatLayerPickerChart(
  props: SeatLayerPickerChartProps,
): React.ReactElement {
  const { sessionId } = useSeatLayerPickerScope();
  return <PickerChartInstance key={sessionId} {...props} />;
}
