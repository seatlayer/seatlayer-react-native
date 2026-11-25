/**
 * Which form of a counted sentence a language uses for a count.
 *
 * The hosted map asks `Intl.PluralRules`. A React Native engine may not have
 * it, and every language would then count as English does, so the same CLDR
 * rules stand here for the whole numbers the picker counts.
 * `test/plural-rules.test.ts` checks every shipped language against a fixture
 * written from `Intl.PluralRules`.
 */
export type SeatLayerPickerPluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

type Rule = (n: number) => SeatLayerPickerPluralCategory;

const within = (n: number, low: number, high: number): boolean => n >= low && n <= high;
const wholeMillion = (n: number): boolean => n !== 0 && n % 1_000_000 === 0;

const oneOther: Rule = (n) => (n === 1 ? 'one' : 'other');
/** 0 and 1 are both singular (Persian, Hindi). */
const zeroAndOne: Rule = (n) => (n === 0 || n === 1 ? 'one' : 'other');
/** No number agreement at all (Chinese, Japanese, Korean, Thai). */
const otherOnly: Rule = () => 'other';
/** French and Portuguese: 0 and 1 singular, whole millions their own form. */
const french: Rule = (n) => (n === 0 || n === 1 ? 'one' : wholeMillion(n) ? 'many' : 'other');
/** Spanish, Italian, Catalan: 1 singular, whole millions their own form. */
const spanish: Rule = (n) => (n === 1 ? 'one' : wholeMillion(n) ? 'many' : 'other');

/** Two to four in the last digit, but not twelve to fourteen. */
const slavicFew = (n: number): boolean => within(n % 10, 2, 4) && !within(n % 100, 12, 14);
const slavicOne = (n: number): boolean => n % 10 === 1 && n % 100 !== 11;
/** Russian, Ukrainian, Belarusian. */
const eastSlavic: Rule = (n) => (slavicOne(n) ? 'one' : slavicFew(n) ? 'few' : 'many');
/** Croatian and Serbian. */
const southSlavic: Rule = (n) => (slavicOne(n) ? 'one' : slavicFew(n) ? 'few' : 'other');
const polish: Rule = (n) => (n === 1 ? 'one' : slavicFew(n) ? 'few' : 'many');
/** Czech and Slovak. Their `many` is for decimals only. */
const czech: Rule = (n) => (n === 1 ? 'one' : within(n, 2, 4) ? 'few' : 'other');

const lithuanian: Rule = (n) => {
  if (within(n % 100, 11, 19)) return 'other';
  if (n % 10 === 1) return 'one';
  return within(n % 10, 2, 9) ? 'few' : 'other';
};
const latvian: Rule = (n) => {
  if (n % 10 === 0 || within(n % 100, 11, 19)) return 'zero';
  return n % 10 === 1 && n % 100 !== 11 ? 'one' : 'other';
};
const arabic: Rule = (n) => {
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (within(n % 100, 3, 10)) return 'few';
  return within(n % 100, 11, 99) ? 'many' : 'other';
};
const welshForms: Readonly<Record<number, SeatLayerPickerPluralCategory>> = {
  0: 'zero', 1: 'one', 2: 'two', 3: 'few', 6: 'many',
};
const welsh: Rule = (n) => welshForms[n] ?? 'other';
const hebrew: Rule = (n) => (n === 1 ? 'one' : n === 2 ? 'two' : 'other');
const slovenian: Rule = (n) => {
  const hundred = n % 100;
  if (hundred === 1) return 'one';
  if (hundred === 2) return 'two';
  return within(hundred, 3, 4) ? 'few' : 'other';
};
const romanian: Rule = (n) => {
  if (n === 1) return 'one';
  return n === 0 || within(n % 100, 1, 19) ? 'few' : 'other';
};

/** The languages that do not count as English does. */
const rules: Readonly<Record<string, Rule>> = Object.freeze({
  ar: arabic, be: eastSlavic, ca: spanish, cs: czech, cy: welsh, es: spanish,
  fa: zeroAndOne, fr: french, he: hebrew, hi: zeroAndOne, hr: southSlavic,
  id: otherOnly, it: spanish, ja: otherOnly, ko: otherOnly, lt: lithuanian,
  lv: latvian, ms: otherOnly, pl: polish, pt: french, ro: romanian,
  ru: eastSlavic, sk: czech, sl: slovenian, sr: southSlavic, th: otherOnly,
  uk: eastSlavic, vi: otherOnly, zh: otherOnly,
});

/** The form `count` takes in the language of `locale`; English where it is unknown. */
export function seatLayerPickerPluralCategory(
  locale: string | null | undefined,
  count: number,
): SeatLayerPickerPluralCategory {
  const language = typeof locale === 'string'
    ? locale.trim().split(/[-_]/, 1)[0]!.toLowerCase()
    : '';
  const rule = Object.prototype.hasOwnProperty.call(rules, language) ? rules[language]! : oneOther;
  return rule(Math.abs(count));
}
