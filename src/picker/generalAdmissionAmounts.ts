import { SeatLayerError } from '../errors';
import { asBoolean, asObject, type JsonValue } from '../json';
import type { GAArea } from '../types';

export interface SeatLayerPickerGAAmounts {
  readonly minimum: number;
  readonly maximum: number;
  /** What the area itself still offers, before the order's own limit. */
  readonly available: number;
}

function places(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
}

/**
 * The amounts one standing area can be asked for, by the page's own rule: the
 * page answers any other amount with no hold and no reason.
 *
 * Per person, any number that is free and left in the order. A box is sold to
 * one party: all its places, or a party inside its range. With the wheelchair
 * filter on, an area offers its wheelchair places and a box only if it has any.
 */
export function projectSeatLayerPickerGAAmounts(
  area: Readonly<GAArea>,
  remaining: number,
  wheelchairOnly: boolean,
): SeatLayerPickerGAAmounts | undefined {
  const box = area.bookingMode === 'whole' || area.bookingMode === 'variable';
  const advertised = area.available === undefined ? undefined : places(area.available) ?? 0;
  const open = !wheelchairOnly ? advertised
    : box ? (places(area.wheelchairPlaces) ?? 0) > 0 ? advertised : 0
      : Math.min(advertised ?? 0, places(area.wheelchairAvailable) ?? 0);
  const room = open === undefined ? remaining : Math.min(remaining, open);
  if (!box) {
    return room < 1 ? undefined : Object.freeze({ minimum: 1, maximum: room, available: open ?? 0 });
  }
  const most = places(area.maxOccupancy) ?? places(area.capacity) ?? open ?? 0;
  const minimum = area.bookingMode === 'whole' ? most : Math.max(1, Math.min(most, places(area.minOccupancy) ?? 1));
  const maximum = Math.min(most, room);
  return minimum < 1 || maximum < minimum
    ? undefined
    : Object.freeze({ minimum, maximum, available: open ?? 0 });
}

/** `held: false` is the page's refusal: it took no places and gives no error. */
export function refusedGAHold(result: JsonValue | undefined): SeatLayerError | undefined {
  return asBoolean(asObject(result)?.held) === false
    ? new SeatLayerError('hold_unavailable', 'The standing places could not be held.')
    : undefined;
}

export function isRefusedGAHold(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === 'hold_unavailable';
}
