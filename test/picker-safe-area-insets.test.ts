import { describe, expect, it } from 'vitest';

import { normalizeSeatLayerPickerSafeAreaInsets } from '../src/picker/safeAreaInsets';

describe('picker safe-area insets', () => {
  it('returns a frozen, zeroed shape for missing or hostile input', () => {
    const inherited = Object.create({ top: 9 });
    Object.defineProperty(inherited, 'right', { enumerable: true, get: () => { throw new Error('getter'); } });
    const trap = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('descriptor'); } });
    const result = normalizeSeatLayerPickerSafeAreaInsets(inherited);
    expect(result).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(normalizeSeatLayerPickerSafeAreaInsets(trap)).toEqual(result);
  });

  it('keeps only finite nonnegative own values and caps unmeasured geometry', () => {
    expect(normalizeSeatLayerPickerSafeAreaInsets({
      top: Number.NaN, right: Number.POSITIVE_INFINITY, bottom: -1, left: 99_999,
    })).toEqual({ top: 0, right: 0, bottom: 0, left: 10_000 });
  });

  it('clamps opposing sides in order so measured content never becomes negative', () => {
    expect(normalizeSeatLayerPickerSafeAreaInsets(
      { top: 40, right: 90, bottom: 80, left: 80 },
      { width: 100, height: 50 },
    )).toEqual({ top: 40, right: 20, bottom: 10, left: 80 });
  });

  it('ignores invalid or hostile bounds while retaining finite safe inputs', () => {
    const bounds = {};
    Object.defineProperty(bounds, 'width', { enumerable: true, get: () => { throw new Error('width'); } });
    expect(normalizeSeatLayerPickerSafeAreaInsets(
      { top: 12, right: 34, bottom: 56, left: 78 },
      bounds,
    )).toEqual({ top: 12, right: 34, bottom: 56, left: 78 });
    expect(normalizeSeatLayerPickerSafeAreaInsets(
      { top: 12, right: 34, bottom: 56, left: 78 },
      { width: Number.POSITIVE_INFINITY, height: -1 },
    )).toEqual({ top: 12, right: 34, bottom: 56, left: 78 });
  });
});
