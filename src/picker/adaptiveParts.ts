import type { ReactNode } from 'react';

import {
  renderSeatLayerPickerPart,
  type SeatLayerPickerBuilders,
  type SeatLayerPickerPartName,
} from './builders';
import type { SeatLayerPickerScopeValue } from './SeatLayerPickerScope';

/** Converts non-rendering builder output to the explicit ready-made absence. */
export function renderSeatLayerPickerAdaptivePart(
  builders: SeatLayerPickerBuilders | undefined,
  scope: SeatLayerPickerScopeValue,
  name: SeatLayerPickerPartName,
  child: ReactNode,
): ReactNode | null {
  const value = renderSeatLayerPickerPart(builders, scope, name, child);
  return value === null || value === undefined || typeof value === 'boolean' ? null : value;
}
