import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatSeatLayerPickerMoney } from '../src/picker/format';
import { seatLayerPickerLocaleSources } from '../src/picker/strings.g';

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/money-web.json'), 'utf8'),
) as { amounts: number[]; money: Record<string, Record<string, string[]>> };

describe('money beside the hosted map of seatlayer-js 1.0.3', () => {
  it('has a row for every language', () => {
    expect(Object.keys(fixture.money)).toEqual(Object.keys(seatLayerPickerLocaleSources).sort());
  });

  it.each(Object.keys(fixture.money))('%s is written as the map writes it', (locale) => {
    for (const [currency, texts] of Object.entries(fixture.money[locale]!)) {
      expect(fixture.amounts.map((amount) =>
        formatSeatLayerPickerMoney(amount, currency, undefined, undefined, locale)), currency).toEqual(texts);
    }
  });

  it('is written in one place', () => {
    const directory = resolve(__dirname, '../src/picker');
    const writers = readdirSync(directory).filter((name) => /\.tsx?$/.test(name) &&
      /toFixed|toLocaleString|Intl\.NumberFormat/.test(readFileSync(join(directory, name), 'utf8')));
    expect(writers).toEqual(['format.ts']);
  });
});
