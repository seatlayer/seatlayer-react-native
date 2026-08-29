import { useLayoutEffect, useRef } from 'react';

import type { SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import { seatLayerPickerInitialSheet } from './adaptiveLayoutState';

/** Initializes one visible sheet per opening and retires an invisible expanded rung. */
export function useSeatLayerPickerAdaptiveSheetOpening(
  scope: SeatLayerPickerScopeValue,
  openingKey: number,
  enabled: boolean,
  initiallyCollapsed: boolean,
): void {
  const opened = useRef<number | undefined>(undefined);
  const hidden = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!enabled) {
      if (scope.presentation.sheet === 'expanded' && hidden.current !== openingKey) {
        hidden.current = openingKey;
        opened.current = openingKey;
        scope.setPresentation({ type: 'setSheet', sheet: 'collapsed' });
      }
      return;
    }
    if (opened.current === openingKey) return;
    opened.current = openingKey;
    const sheet = seatLayerPickerInitialSheet(initiallyCollapsed);
    if (scope.presentation.sheet !== sheet) scope.setPresentation({ type: 'setSheet', sheet });
  }, [enabled, initiallyCollapsed, openingKey, scope.presentation.sheet, scope.setPresentation]);
}
