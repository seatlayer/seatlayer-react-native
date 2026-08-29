import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { SeatLayerRenderer } from './SeatLayerRenderer';
import { SeatLayerError } from './errors';
import type { ReadyInfo, SeatLayerConfiguration } from './types';
import type { SeatLayerController } from './controller';

export interface SeatLayerViewProps {
  controller: SeatLayerController;
  configuration: SeatLayerConfiguration;
  style?: StyleProp<ViewStyle>;
  /**
   * Change this to force a clean renderer and bridge reload without changing
   * configuration.
   */
  reloadKey?: string | number;
  testID?: string;
  accessibilityLabel?: string;
  onReady?: (info: ReadyInfo) => void;
  onLoadError?: (error: SeatLayerError) => void;
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
  return (
    <SeatLayerRenderer
      controller={controller}
      configuration={configuration}
      style={style}
      reloadKey={reloadKey}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onReady={onReady}
      onLoadError={onLoadError}
      onUnmount={() =>
        controller.disconnect(
          SeatLayerError.transport('SeatLayer view unmounted.'),
          false,
        )
      }
    />
  );
}
