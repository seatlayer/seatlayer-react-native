import React, { createContext, useContext } from 'react';

import type { SeatLayerPickerScopeValue } from './SeatLayerPickerScope';

/** Internal context for the active picker scope. */
export const SeatLayerPickerScopeContext = createContext<SeatLayerPickerScopeValue | undefined>(
  undefined,
);

export function useSeatLayerPickerScopeContext(): SeatLayerPickerScopeValue {
  const value = useContext(SeatLayerPickerScopeContext);
  if (value === undefined) {
    throw new Error('SeatLayer picker components must be rendered inside SeatLayerPickerScope.');
  }
  return value;
}
