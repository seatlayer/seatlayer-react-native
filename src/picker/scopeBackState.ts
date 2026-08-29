import type { SeatLayerPickerSnapshot } from './models';
import {
  reduceSeatLayerPickerPresentationState,
  type SeatLayerPickerPresentationState,
} from './presentationState';
import type { PendingConfirmationState } from './pendingConfirmationState';

/** Derives a synchronous Back view from renderer truth without dispatching. */
export function resolveSeatLayerPickerBackState(
  presentation: SeatLayerPickerPresentationState,
  snapshot: SeatLayerPickerSnapshot | undefined,
  pending: PendingConfirmationState['pending'],
): SeatLayerPickerPresentationState {
  const rendererState = snapshot === undefined ? presentation :
    reduceSeatLayerPickerPresentationState(presentation, {
      type: 'syncSnapshot',
      rung: snapshot.map.rung,
      focusedSectionId: snapshot.map.focusedSectionId ?? snapshot.map.focusedSection?.id ?? null,
    });
  return pending === null || rendererState.pendingConfirmation !== null
    ? rendererState
    : { ...rendererState, pendingConfirmation: { context: pending } };
}
