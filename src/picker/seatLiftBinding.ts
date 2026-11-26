import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { SeatLayerPickerController } from './controller';
import {
  SeatLayerPickerSeatLift, seatLayerPickerSeatCardInsetBand,
} from './seatLift';

export interface SeatLayerPickerSeatLiftBindingInput {
  readonly controller: SeatLayerPickerController;
  /** A new session is a new runtime; the lift never carries across one. */
  readonly sessionId: number;
  /** The seat a card is open about, or null once the card has gone. */
  readonly seatId: string | null;
  readonly mapHeight: number;
  readonly top: number;
  readonly bottom: number;
  /** The band the card covers, measured from the map's foot; 0 with no card. */
  readonly sheet: number;
  readonly revision: number;
  /**
   * The pan standing over the snapshot the chrome is reading (§3.8.2).
   *
   * Anything drawn against `selection[].screenPoint` — the spotlight hole —
   * adds it, or it lands a whole lift band below the seat. Reported rather
   * than returned because the lift moves from an async command reply, not
   * from a render.
   */
  readonly onAnchorDy?: (dy: number) => void;
}

/**
 * §3.8.2 — one lift per session, and never both ways at once.
 *
 * A runtime whose hello table carries `picker.frameSeat` pans the map out from
 * under the card and puts it back. One that does not is given the card's band
 * as a viewport inset instead, which refits rather than pans. Doing both would
 * move the seat twice.
 *
 * @returns the bottom viewport inset to report, or 0 while the map pans.
 */
export function useSeatLayerPickerSeatLiftBinding(
  input: SeatLayerPickerSeatLiftBindingInput,
): number {
  const { controller, sessionId } = input;
  const pans = controller.supportsFrameSeat;
  const lift = useMemo(
    () => new SeatLayerPickerSeatLift({
      frameSeat: (seatId, options) => controller.frameSeat(seatId, options),
    }),
    [controller, sessionId],
  );
  const liftRef = useRef(lift);
  liftRef.current = lift;
  const anchorRef = useRef(input.onAnchorDy);
  anchorRef.current = input.onAnchorDy;
  useEffect(() => {
    lift.setAnchorListener((dy) => anchorRef.current?.(dy));
    return () => { lift.setAnchorListener(undefined); };
  }, [lift]);
  useEffect(() => () => { liftRef.current.forget(); }, [lift]);
  const [, drawAgain] = useState(0);
  useLayoutEffect(() => {
    if (!pans) return;
    lift.sync({
      seatId: input.seatId,
      mapHeight: input.mapHeight,
      top: input.top,
      bottom: input.bottom,
      sheet: input.sheet,
      revision: input.revision,
    });
    if (!lift.isSettling) return;
    // A lift is sent once two renders agree on the map's height. Where nothing
    // else draws again after the card opens (a phone held sideways has no
    // sheet collapsing under it), the next frame has to be asked for, or the
    // lift waits for ever and the card covers its seat.
    const frame = nextFrame(() => drawAgain((count) => count + 1));
    return () => { frame.cancel(); };
  });
  if (pans || input.seatId === null || !(input.sheet > 0)) return 0;
  return seatLayerPickerSeatCardInsetBand({
    chromeBottom: input.bottom,
    cardTop: input.mapHeight - input.sheet,
    mapHeight: input.mapHeight,
  });
}

function nextFrame(callback: () => void): { cancel(): void } {
  const host = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: () => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  if (host.requestAnimationFrame && host.cancelAnimationFrame) {
    const handle = host.requestAnimationFrame(callback);
    return { cancel: () => { host.cancelAnimationFrame!(handle); } };
  }
  const handle = setTimeout(callback, 16);
  return { cancel: () => { clearTimeout(handle); } };
}
