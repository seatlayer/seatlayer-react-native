import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

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
  useEffect(() => () => { liftRef.current.forget(); }, [lift]);
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
  });
  if (pans || input.seatId === null || !(input.sheet > 0)) return 0;
  return seatLayerPickerSeatCardInsetBand({
    chromeBottom: input.bottom,
    cardTop: input.mapHeight - input.sheet,
    mapHeight: input.mapHeight,
  });
}
