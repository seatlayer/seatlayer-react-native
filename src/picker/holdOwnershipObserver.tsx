import React, { useEffect, useLayoutEffect, useRef } from 'react';

import { seatLayerPickerHoldOwnershipStore } from './holdOwnership';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';

/**
 * §3.13.13 — the picker's own ear on the runtime's refusals.
 *
 * The buyer's second tap under a host-owned hold is answered INSIDE the map,
 * by the runtime, so no native command is in flight and no promise rejects:
 * the refusal arrives as an unsolicited bridge `error` event. Until this
 * observer existed the picker listened to that event only to hand it to the
 * host's `onError` callback, so the tap was absorbed in silence — the map did
 * not move, the cart did not grow, and nothing said why. The one place the
 * notice had ever been raised was a cart row's ×, which IS a native command
 * and so DID reject.
 *
 * The reference reaches the same state by the same road (its controller parks
 * every bridge error into the picker's action-error slot, and the notice reads
 * it there), which is why the notice is drawn in the sheet and not over the
 * map: it belongs to the tray the seats are in.
 *
 * Only the three ownership refusals are taken. Anything else stays the host's
 * to handle, exactly as before — an unsolicited failure is not turned into a
 * new inline surface here.
 */
export function SeatLayerPickerHoldOwnershipObserver(): null {
  const scope = useSeatLayerPickerScope();
  const scopeRef = useRef(scope);
  useLayoutEffect(() => { scopeRef.current = scope; });
  const controller = scope.controller;
  const sessionId = scope.sessionId;
  useEffect(() => {
    let alive = true;
    const dispose = controller.mapController.on('error', (error: unknown) => {
      if (!alive || scopeRef.current.sessionId !== sessionId) return;
      const handoff = typeof controller.getCheckoutHandoff === 'function'
        ? controller.getCheckoutHandoff()
        : undefined;
      try {
        seatLayerPickerHoldOwnershipStore(controller).raise(error, handoff);
      } catch {
        // A notice that cannot be raised must not take the session with it.
      }
    });
    return () => {
      alive = false;
      try { dispose(); } catch { /* Runtime cleanup is inert. */ }
    };
  }, [controller, sessionId]);
  return null;
}
