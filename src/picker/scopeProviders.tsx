import React, { type PropsWithChildren } from 'react';

import { SeatLayerPickerBlockedRegionProvider } from './blockedRegionsContext';
import { SeatLayerPickerScopeContext } from './pickerScopeContext';
import type { SeatLayerPickerScopeValue } from './pickerScopeTypes';
import type { SeatLayerPickerAnimationFrameScheduler } from './viewportInsets';

export interface SeatLayerPickerScopeProvidersProps extends PropsWithChildren {
  readonly value: SeatLayerPickerScopeValue;
  readonly scheduler: SeatLayerPickerAnimationFrameScheduler;
}

/**
 * The two things every scoped tree stands inside: the scope value itself, and
 * the blocked-region registry that reports native chrome to the map (§2.4).
 *
 * The registry is remounted per session — a new runtime starts with an empty
 * list by construction — and reports nothing at all while the runtime's hello
 * table lacks `picker.setBlockedRegions`, which is a capability not offered
 * rather than a failure.
 */
export function SeatLayerPickerScopeProviders({
  children,
  scheduler,
  value,
}: SeatLayerPickerScopeProvidersProps): React.ReactElement {
  return (
    <SeatLayerPickerScopeContext.Provider value={value}>
      <SeatLayerPickerBlockedRegionProvider
        reportError={value.reportError}
        scheduler={scheduler}
        sessionId={value.sessionId}
        sink={(rects) => value.controller.setBlockedRegions(rects)}
        supported={() => value.controller.supportsBlockedRegions}
      >
        {children}
      </SeatLayerPickerBlockedRegionProvider>
    </SeatLayerPickerScopeContext.Provider>
  );
}
