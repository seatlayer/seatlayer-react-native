import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { SeatLayerPickerStyles } from './styles';

type AttributionSlots = Pick<
  SeatLayerPickerStyles,
  'attributionContainer' | 'attributionText' | 'attributionMark'
>;

/** @deprecated The picker draws no SeatLayer credit. Remove it. */
export interface SeatLayerPickerAttributionProps {
  readonly compact?: boolean;
  readonly visible?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: AttributionSlots;
}

/**
 * Draws nothing. Kept so an app that mounts it still builds.
 *
 * @deprecated The picker draws no SeatLayer credit. Remove it.
 */
export function SeatLayerPickerAttribution(
  _props: SeatLayerPickerAttributionProps,
): React.ReactElement | null {
  return null;
}
