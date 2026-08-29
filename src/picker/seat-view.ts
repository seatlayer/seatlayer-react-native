import type { SeatLayerSeatView } from './models';

export function sameSeatView(
  left: SeatLayerSeatView | undefined,
  right: SeatLayerSeatView | undefined,
): boolean {
  return left?.seatId === right?.seatId &&
    left?.title === right?.title &&
    left?.caption === right?.caption &&
    left?.badge === right?.badge &&
    left?.real === right?.real &&
    left?.generated === right?.generated &&
    left?.dragHint === right?.dragHint;
}
