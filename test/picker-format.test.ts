import { describe, expect, it, vi } from 'vitest';

import {
  formatSeatLayerPickerCompactMoney,
  formatSeatLayerPickerMoney,
  normalizeSeatLayerPickerRowLabel,
} from '../src/picker/format';

describe('picker money formatting', () => {
  it('formats known symbols, unknown codes, decimals, and hostile runtime values', () => {
    expect(formatSeatLayerPickerCompactMoney(75, 'usd')).toBe('$75');
    expect(formatSeatLayerPickerCompactMoney(12.5, 'eur')).toBe('€12.50');
    expect(formatSeatLayerPickerCompactMoney(1080, 'cad')).toBe('CAD 1080');
    expect(formatSeatLayerPickerCompactMoney(Number.NaN, '' as never)).toBe('$0');
    expect(formatSeatLayerPickerCompactMoney(Number.POSITIVE_INFINITY, { toString: () => 'EUR' } as never)).toBe('$0');
  });

  it('contains formatter failures and reports them once per call before falling back', () => {
    const report = vi.fn();
    expect(formatSeatLayerPickerMoney(12, 'USD', () => 'Host $12', report)).toBe('Host $12');
    expect(formatSeatLayerPickerMoney(12, 'USD', () => { throw new Error('formatter failed'); }, report)).toBe('$12');
    expect(formatSeatLayerPickerMoney(12, 'USD', () => '   ', report)).toBe('$12');
    expect(formatSeatLayerPickerMoney(12, 'USD', (() => ({ toString: () => { throw new Error('unsafe return'); } })) as never, report)).toBe('$12');
    expect(report).toHaveBeenCalledTimes(3);
  });
});

describe('picker row-label normalization', () => {
  it('removes full labels, section codes, and uppercase abbreviations across chart separators', () => {
    expect(normalizeSeatLayerPickerRowLabel('Stalls D C', 'Stalls D')).toBe('C');
    expect(normalizeSeatLayerPickerRowLabel('GALL-H', 'Gallery', 'GALL')).toBe('H');
    expect(normalizeSeatLayerPickerRowLabel('ORCH · AA', 'Orchestra')).toBe('AA');
    expect(normalizeSeatLayerPickerRowLabel('GALL/ H', 'Gallery')).toBe('H');
    expect(normalizeSeatLayerPickerRowLabel('BALC–J', 'Balcony')).toBe('J');
    expect(normalizeSeatLayerPickerRowLabel('MEZZ—K', 'Mezzanine')).toBe('K');
  });

  it('preserves bare, unrelated, section-only, and hostile labels', () => {
    expect(normalizeSeatLayerPickerRowLabel('A', 'Gallery', 'GALL')).toBe('A');
    expect(normalizeSeatLayerPickerRowLabel('Lower A', 'Gallery')).toBe('Lower A');
    expect(normalizeSeatLayerPickerRowLabel('Gallery', 'Gallery')).toBe('Gallery');
    expect(normalizeSeatLayerPickerRowLabel({ toString: () => { throw new Error('row'); } } as never, 'Gallery')).toBe('');
    expect(normalizeSeatLayerPickerRowLabel('Gallery A', { toString: () => { throw new Error('section'); } } as never)).toBe('Gallery A');
  });
});
