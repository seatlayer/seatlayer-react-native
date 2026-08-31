import React from 'react';

import type { SeatLayerPickerScopeValue } from '../../src/picker/SeatLayerPickerScope';
import { SeatLayerPickerScopeContext } from '../../src/picker/pickerScopeContext';

/** Test-only provider for deterministic fixtures. It is not exported by the SDK. */
export function FixtureScopeProvider({
  children,
  value,
}: Readonly<{
  children: React.ReactNode;
  value: SeatLayerPickerScopeValue;
}>): React.ReactElement {
  return (
    <SeatLayerPickerScopeContext.Provider value={value}>
      {children}
    </SeatLayerPickerScopeContext.Provider>
  );
}
