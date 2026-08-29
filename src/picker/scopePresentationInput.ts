import type {
  SeatLayerPickerLocalPresentationEvent,
} from './presentationState';

function ownValue(record: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Copies only data fields before host-observable state reaches the reducer. */
export function safeSeatLayerPickerPresentationInput(
  value: unknown,
): SeatLayerPickerLocalPresentationEvent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const type = ownValue(value, 'type');
  if (type !== 'setSheet') return undefined;
  const sheet = ownValue(value, 'sheet');
  return typeof sheet === 'string' ? { type, sheet } : undefined;
}
