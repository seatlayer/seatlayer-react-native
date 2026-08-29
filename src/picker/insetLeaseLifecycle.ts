import { useEffect } from 'react';

import type { SeatLayerPickerInsetLease } from './insetOwnership';
import type { SeatLayerPickerViewportInsetInput } from './viewportInsets';

const noInset: SeatLayerPickerViewportInsetInput = Object.freeze({});

/** An inset lease survives visibility and measurement updates, but not its owner. */
export function useSeatLayerPickerInsetLease(
  lease: SeatLayerPickerInsetLease | undefined,
  insets: SeatLayerPickerViewportInsetInput | undefined,
): void {
  useEffect(() => { lease?.set(insets ?? noInset); }, [insets, lease]);
  useEffect(() => () => { lease?.remove(); }, [lease]);
}
