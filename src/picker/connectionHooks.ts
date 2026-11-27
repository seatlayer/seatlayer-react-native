import { useSyncExternalStore } from 'react';

import { seatLayerLineDown, type SeatLayerConnectionShown, type SeatLayerConnectionState } from './connection';
import type { SeatLayerPickerController } from './controller';

const noSubscription = (): (() => void) => () => {};
const nothingShown = (): SeatLayerConnectionShown => 'none';
const noState = (): SeatLayerConnectionState | null => null;

// A stand-in controller without the page line says nothing, and its line is never down.
function source(controller: SeatLayerPickerController) {
  return typeof controller.subscribeConnection === 'function' ? controller.subscribeConnection : noSubscription;
}

/** What the picker's connection status says now. */
export function useSeatLayerPickerConnectionShown(controller: SeatLayerPickerController): SeatLayerConnectionShown {
  const read = typeof controller.getConnectionShown === 'function' ? controller.getConnectionShown : nothingShown;
  return useSyncExternalStore(source(controller), read, read);
}

/** Whether the page says its line is down (`offline` or `reconnecting`). */
export function useSeatLayerPickerLineDown(controller: SeatLayerPickerController): boolean {
  const read = typeof controller.getConnection === 'function' ? controller.getConnection : noState;
  return seatLayerLineDown(useSyncExternalStore(source(controller), read, read));
}
