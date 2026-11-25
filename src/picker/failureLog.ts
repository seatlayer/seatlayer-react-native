import type { JsonValue } from '../json';
import { asInteger, asObject, asString } from '../json';
import type { SeatLayerPickerSnapshot } from './models';

/** The action a failure answered, as far as its sentence needs it. */
export interface SeatLayerPickerActionFailure {
  readonly command: string;
  /** How many seats Best Available was asked for. */
  readonly quantity?: number;
  /** The cart line a removal named, as the buyer reads it. */
  readonly label?: string;
}

const failures = new WeakMap<object, SeatLayerPickerActionFailure>();

/** Remembers what `flight` was asked for, beside the error it ends with. */
export function rememberSeatLayerPickerFailure<Value>(
  flight: Promise<Value>,
  command: string,
  payload?: JsonValue,
  snapshot?: SeatLayerPickerSnapshot,
): Promise<Value> {
  return flight.catch((error: unknown) => {
    if (error !== null && typeof error === 'object' && !failures.has(error)) {
      const quantity = asInteger(asObject(payload)?.qty);
      const label = asString(asObject(payload)?.label);
      const line = label === undefined
        ? undefined
        : snapshot?.cartLines.find((item) => item.label === label);
      const named = line?.displayLabel ?? label;
      failures.set(error, Object.freeze({
        command,
        ...(quantity === undefined ? {} : { quantity }),
        ...(named === undefined ? {} : { label: named }),
      }));
    }
    throw error;
  });
}

/** The action `error` answered, when it answered one. */
export function seatLayerPickerFailureFor(error: unknown): SeatLayerPickerActionFailure | undefined {
  return error !== null && typeof error === 'object' ? failures.get(error) : undefined;
}
