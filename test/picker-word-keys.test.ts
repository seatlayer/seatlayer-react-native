import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { seatLayerPickerEnglishStrings, seatLayerPickerLocaleWords } from '../src/picker/locale';
import { seatLayerPickerLocaleSources, type SeatLayerPickerGeneratedLocale } from '../src/picker/strings.g';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const root = resolve(__dirname, '..');
const locales = Object.keys(seatLayerPickerLocaleSources) as SeatLayerPickerGeneratedLocale[];

function sources(directory = join(root, 'src')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.g.ts') ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('the words the package carries', () => {
  it('has every word the picker asks for', () => {
    const asked = new Set(sources().flatMap((code) => [
      ...code.matchAll(/translate\(\s*(['"])([A-Za-z][\w.]*)\1/g),
      ...code.matchAll(/\b(?:title|body|action|message|label|cta)Key:\s*(['"])([A-Za-z][\w.]*)\1/g),
    ].map((match) => match[2]!)));
    expect(asked.size).toBeGreaterThan(120);
    const missing = [...asked].filter((key) =>
      !(key in seatLayerPickerEnglishStrings) && !(`${key}.other` in seatLayerPickerEnglishStrings));
    expect(missing).toEqual([]);
  });

  it('has no word that nothing uses, beside those of published versions', async () => {
    // @ts-expect-error The generator is a script without types.
    const generator = await import('../scripts/generate-picker-design.mjs');
    const keep = generator.keyFilters({
      published: await generator.readPublishedKeys(), used: await generator.readUsedNames(),
    });
    expect(Object.keys(seatLayerPickerTokens.strings).filter((key) => !keep.english(key))).toEqual([]);
    const carried = new Set(locales.flatMap((locale) => Object.keys(seatLayerPickerLocaleWords(locale))));
    expect([...carried].filter((key) => !keep.dictionary(key))).toEqual([]);
    for (const name of ['yourSeats', 'notAWord']) {
      expect(keep.english(name)).toBe(false);
      expect(keep.dictionary(name)).toBe(false);
    }
  });

  it('builds a language once, when it is asked for', () => {
    expect(locales).toHaveLength(43);
    for (const locale of locales) {
      expect(typeof seatLayerPickerLocaleSources[locale]).toBe('function');
      expect(seatLayerPickerLocaleWords(locale)).toBe(seatLayerPickerLocaleWords(locale));
    }
  });
});
