import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { translateSeatLayerPickerString } from '../src/picker/locale';
import { seatLayerPickerPluralCategory } from '../src/picker/pluralRules';
import { seatLayerPickerLocaleSources } from '../src/picker/strings.g';

interface Fixture {
  readonly counts: readonly number[];
  readonly categories: Readonly<Record<string, readonly string[]>>;
}

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/plural-categories.json'), 'utf8'),
) as Fixture;

describe('plural rules', () => {
  it('has a fixture row for every language the picker ships', () => {
    expect(Object.keys(fixture.categories).sort()).toEqual(
      expect.arrayContaining(Object.keys(seatLayerPickerLocaleSources).sort()),
    );
  });

  it.each(Object.keys(fixture.categories))('%s counts as the map does', (locale) => {
    expect(fixture.counts.map((count) => seatLayerPickerPluralCategory(locale, count)))
      .toEqual(fixture.categories[locale]);
  });

  it('reads the language of a full tag, and counts an unknown one as English', () => {
    expect(seatLayerPickerPluralCategory('ru-RU', 21)).toBe('one');
    expect(seatLayerPickerPluralCategory('PT_br', 0)).toBe('one');
    expect(seatLayerPickerPluralCategory('zh-Hant', 1)).toBe('other');
    for (const locale of ['xx', '', undefined, null, 'constructor']) {
      expect(seatLayerPickerPluralCategory(locale, 1)).toBe('one');
      expect(seatLayerPickerPluralCategory(locale, 2)).toBe('other');
    }
  });

  it('does not need the engine to know plurals', () => {
    const own = Intl.PluralRules;
    (Intl as { PluralRules?: unknown }).PluralRules = undefined;
    try {
      const five = translateSeatLayerPickerString('ticketCount', { locale: 'ru', count: 5 });
      const one = translateSeatLayerPickerString('ticketCount', { locale: 'ru', count: 21 });
      const two = translateSeatLayerPickerString('ticketCount', { locale: 'ru', count: 2 });
      expect(new Set([five, one, two].map((text) => text.replace(/\d+/, ''))).size).toBe(3);
    } finally {
      (Intl as { PluralRules?: unknown }).PluralRules = own;
    }
  });
});
