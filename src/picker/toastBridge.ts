import {
  seatLayerPickerHoldExpiredToast, seatLayerPickerHoldLapseToast,
  seatLayerPickerSalesClosedToast, type SeatLayerPickerToast,
} from './buyerStates';
import type { SeatLayerPickerHoldLapse } from './holdLapse';
import type { SeatLayerPickerScopeValue } from './pickerScopeTypes';
import type { SeatLayerToastRequest } from './toastQueue';

/**
 * The states machine speaks in string tokens; the toast surface speaks in
 * sentences. This is the one place the two meet, so a host override of a
 * string still wins and no surface invents a recovery of its own.
 */
export function seatLayerPickerToastRequest(
  toast: SeatLayerPickerToast,
  scope: SeatLayerPickerScopeValue,
): SeatLayerToastRequest {
  const message = scope.strings.translate(toast.messageKey, {
    ...(toast.count === undefined ? {} : { count: toast.count }),
    ...(toast.values === undefined ? {} : { values: toast.values }),
  });
  // `reselectLapsedSeats` is the only recovery there is. A payload naming any
  // other action is drawn without one rather than guessed at.
  const recovery = toast.action === 'reselectLapsedSeats' ? scope.reselectHoldLapse : undefined;
  return Object.freeze({
    message,
    tone: toast.tone,
    actionLabel: toast.actionKey === undefined || recovery === undefined
      ? null
      : scope.strings.translate(toast.actionKey, { count: toast.count ?? 1 }),
    ...(recovery === undefined ? {} : { onAction: () => { void recovery(); } }),
  });
}

/** The news a lapsed hold is, as one payload; `undefined` while nothing lapsed. */
export function seatLayerPickerHoldLapseNews(
  lapse: SeatLayerPickerHoldLapse | undefined,
  lapsed: boolean,
  locale?: string | null,
): SeatLayerPickerToast | undefined {
  if (lapse !== undefined) return seatLayerPickerHoldLapseToast(lapse, locale);
  return lapsed ? seatLayerPickerHoldExpiredToast() : undefined;
}

export { seatLayerPickerSalesClosedToast };
