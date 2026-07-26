import { asInteger, asObject } from '../json';
import type { ProtocolRange } from '../types';

export const nativeProtocolRange: ProtocolRange = { min: 1, max: 1 };

export function decodeProtocolRange(value: unknown): ProtocolRange | undefined {
  const revision = asInteger(value);
  if (revision !== undefined) return { min: revision, max: revision };
  const object = asObject(value);
  const min = asInteger(object?.min);
  const max = asInteger(object?.max);
  return min !== undefined && max !== undefined && min <= max
    ? { min, max }
    : undefined;
}

export function negotiateProtocol(
  web: ProtocolRange,
  native: ProtocolRange = nativeProtocolRange,
): number {
  const agreed = Math.min(web.max, native.max);
  if (agreed < web.min || agreed < native.min) {
    throw new Error(
      `No shared SeatLayer protocol revision (native ${native.min}..${native.max}, web ${web.min}..${web.max}).`,
    );
  }
  return agreed;
}
