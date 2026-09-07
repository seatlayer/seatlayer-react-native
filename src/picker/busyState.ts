import { useCallback, useMemo, useState } from 'react';

/**
 * What the picker is doing, when it is doing something.
 *
 * A boolean could not tell a removal from a cancellation, so every in-flight
 * action blocked Continue — including the one action §3.10.2 says must not:
 * taking a line out of the tray, which the row itself answers and which the
 * controller serialises behind any Continue pressed during it.
 */
export type SeatLayerPickerBusyAction =
  | 'cancellingSeat'
  | 'walkingBack'
  | 'removingCartLine';

/** Whether an in-flight action stands in the way of checkout. */
export function seatLayerPickerBusyBlocksCheckout(
  action: SeatLayerPickerBusyAction | null,
): boolean {
  return action !== null && action !== 'removingCartLine';
}

export interface SeatLayerPickerBusyState {
  readonly action: SeatLayerPickerBusyAction | null;
  readonly isBusy: boolean;
  readonly blocksCheckout: boolean;
  /** Marks an action in flight, or clears it with `null`. */
  readonly set: (action: SeatLayerPickerBusyAction | null) => void;
}

export function useSeatLayerPickerBusyState(): SeatLayerPickerBusyState {
  const [action, setAction] = useState<SeatLayerPickerBusyAction | null>(null);
  const set = useCallback((next: SeatLayerPickerBusyAction | null) => { setAction(next); }, []);
  return useMemo(() => Object.freeze({
    action,
    blocksCheckout: seatLayerPickerBusyBlocksCheckout(action),
    isBusy: action !== null,
    set,
  }), [action, set]);
}
