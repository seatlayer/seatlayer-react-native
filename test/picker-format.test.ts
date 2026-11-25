import { describe, expect, it, vi } from 'vitest';

import {
  formatSeatLayerPickerCompactMoney,
  formatSeatLayerPickerMoney,
  normalizeSeatLayerPickerRowLabel,
} from '../src/picker/format';

describe('picker money formatting', () => {
  it('writes a currency’s own decimals and a thousands mark', () => {
    const en = (amount: number, currency: string) =>
      formatSeatLayerPickerCompactMoney(amount, currency).replaceAll('\u00A0', ' ');
    expect(en(75, 'usd')).toBe('$75');
    expect(en(12.5, 'eur')).toBe('€12.50');
    expect(en(12.625, 'KWD')).toBe('KWD 12.625');
    expect(en(12454.5, 'KWD')).toBe('KWD 12,454.500');
    expect(en(12454, 'KWD')).toBe('KWD 12,454');
    expect(en(125000, 'INR')).toBe('₹125,000');
    expect(en(1200, 'JPY')).toBe('¥1,200');
    expect(en(-5, 'USD')).toBe('-$5');
  });

  it('writes money as the picker’s language does', () => {
    const inLocale = (locale: string, amount: number, currency: string) =>
      formatSeatLayerPickerCompactMoney(amount, currency, locale).replaceAll('\u00A0', ' ');
    expect(inLocale('de', 1234.5, 'EUR')).toBe('1.234,50 €');
    expect(inLocale('hi', 125000, 'INR')).toBe('₹1,25,000');
    expect(inLocale('not a locale', 12454.5, 'KWD')).toBe('KWD 12,454.500');
  });

  it('contains hostile runtime values', () => {
    expect(formatSeatLayerPickerCompactMoney(Number.NaN, '' as never)).toBe('$0');
    expect(formatSeatLayerPickerCompactMoney(Number.POSITIVE_INFINITY, { toString: () => 'EUR' } as never)).toBe('$0');
    expect(formatSeatLayerPickerCompactMoney(1250.5, 'not a code')).toBe('NOT A CODE\u00A01,250.50');
    expect(formatSeatLayerPickerCompactMoney(5, 'constructor')).toBe('CONSTRUCTOR\u00A05');
  });

  it('writes the same decimals on an engine with no number formats', async () => {
    vi.stubGlobal('Intl', undefined);
    vi.resetModules();
    const plain = (await import('../src/picker/format')).formatSeatLayerPickerCompactMoney;
    try {
      expect(plain(12454.5, 'KWD')).toBe('KWD\u00A012,454.500');
      expect(plain(1234567.5, 'USD', 'de')).toBe('$1,234,567.50');
      expect(plain(100, 'EUR')).toBe('€100');
      expect(plain(-1200, 'JPY')).toBe('-¥1,200');
    } finally {
      vi.unstubAllGlobals();
    }
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
