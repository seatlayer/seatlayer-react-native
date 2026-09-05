import { seatLayerPickerLocaleStrings, type SeatLayerPickerGeneratedLocale } from './strings.g';
import { seatLayerPickerTokens } from './tokens.g';

export type SeatLayerPickerLocale = SeatLayerPickerGeneratedLocale | (string & {});
export type SeatLayerPickerStringValues = Readonly<Record<string, string | number | undefined>>;

/** English wording for native chrome which is not present in the runtime locale dictionaries. */
export const seatLayerPickerEnglishStrings = {
  ...seatLayerPickerTokens.strings,
  'findBestSeats.one': seatLayerPickerTokens.strings.findBestSeatsOne,
  'findBestSeats.other': seatLayerPickerTokens.strings.findBestSeatsOther,
  'holdLapsedAllTaken.one': seatLayerPickerTokens.strings.holdLapsedAllTakenOne,
  'holdLapsedAllTaken.other': seatLayerPickerTokens.strings.holdLapsedAllTakenOther,
  'holdLapsedSomeTaken.one': seatLayerPickerTokens.strings.holdLapsedSomeTakenOne,
  'holdLapsedSomeTaken.other': seatLayerPickerTokens.strings.holdLapsedSomeTakenOther,
  'holdLapsedStillFree.one': seatLayerPickerTokens.strings.holdLapsedStillFreeOne,
  'holdLapsedStillFree.other': seatLayerPickerTokens.strings.holdLapsedStillFreeOther,
  'holdMinutesLeft.one': seatLayerPickerTokens.strings.holdMinutesLeftOne,
  'holdMinutesLeft.other': seatLayerPickerTokens.strings.holdMinutesLeftOther,
  'holdSecondsLeft.one': seatLayerPickerTokens.strings.holdSecondsLeftOne,
  'holdSecondsLeft.other': seatLayerPickerTokens.strings.holdSecondsLeftOther,
  'removeTickets.one': seatLayerPickerTokens.strings.removeTicketsOne,
  'removeTickets.other': seatLayerPickerTokens.strings.removeTicketsOther,
  'reselectSeats.one': seatLayerPickerTokens.strings.reselectSeatsOne,
  'reselectSeats.other': seatLayerPickerTokens.strings.reselectSeatsOther,
  'seatsFree.one': seatLayerPickerTokens.strings.seatsFreeOne,
  'seatsFree.other': seatLayerPickerTokens.strings.seatsFreeOther,
  'ticketCount.one': seatLayerPickerTokens.strings.ticketCountOne,
  'ticketCount.other': seatLayerPickerTokens.strings.ticketCountOther,
} as const;

export type SeatLayerPickerEnglishStringKey = keyof typeof seatLayerPickerEnglishStrings;
/** Accepts future runtime string keys without making an unknown key a decoding failure. */
export type SeatLayerPickerStringKey = SeatLayerPickerEnglishStringKey | (string & {});
export type SeatLayerPickerKnownAccessNeed =
  | 'wheelchair'
  | 'companion'
  | 'semi-ambulatory'
  | 'designated-aisle'
  | 'step-free'
  | 'hearing'
  | 'cart'
  | 'sign-language'
  | 'low-vision'
  | 'sensory-friendly'
  | 'plus-size'
  | 'lift-armrest';
export type SeatLayerPickerAccessNeed = SeatLayerPickerKnownAccessNeed | (string & {});

/** English names for every access filter the picker currently understands. */
export const seatLayerPickerEnglishAccessNeeds: Readonly<Record<SeatLayerPickerKnownAccessNeed, string>> = Object.freeze({
  wheelchair: seatLayerPickerEnglishStrings.accessWheelchair,
  companion: seatLayerPickerEnglishStrings.accessCompanion,
  'semi-ambulatory': seatLayerPickerEnglishStrings.accessSemiAmbulatory,
  'designated-aisle': seatLayerPickerEnglishStrings.accessDesignatedAisle,
  'step-free': seatLayerPickerEnglishStrings.accessStepFree,
  hearing: seatLayerPickerEnglishStrings.accessHearing,
  cart: seatLayerPickerEnglishStrings.accessCart,
  'sign-language': seatLayerPickerEnglishStrings.accessSignLanguage,
  'low-vision': seatLayerPickerEnglishStrings.accessLowVision,
  'sensory-friendly': seatLayerPickerEnglishStrings.accessSensoryFriendly,
  'plus-size': seatLayerPickerEnglishStrings.accessPlusSize,
  'lift-armrest': seatLayerPickerEnglishStrings.accessLiftArmrest,
});

export interface SeatLayerPickerStringContext {
  readonly key: SeatLayerPickerStringKey;
  readonly locale?: SeatLayerPickerLocale | null;
  readonly count?: number;
  readonly values: SeatLayerPickerStringValues;
}

export type SeatLayerPickerStringFormatter = (context: SeatLayerPickerStringContext) => string | undefined;
export type SeatLayerPickerStringOverride = string | SeatLayerPickerStringFormatter;

/**
 * Host wording layered above the generated locale dictionary. Data properties
 * are copied into an immutable resolver; inherited and accessor properties are
 * intentionally ignored.
 */
export type SeatLayerPickerStringOverrides = Readonly<
  Partial<Record<SeatLayerPickerEnglishStringKey, SeatLayerPickerStringOverride>>
  & { accessNeeds?: Readonly<Partial<Record<SeatLayerPickerAccessNeed, SeatLayerPickerStringOverride>>> }
>;

export interface SeatLayerPickerTranslationOptions {
  locale?: SeatLayerPickerLocale | null;
  values?: SeatLayerPickerStringValues;
  count?: number;
  overrides?: SeatLayerPickerStringOverrides | null;
}

export interface SeatLayerPickerStringResolver {
  readonly locale?: SeatLayerPickerLocale | null;
  translate(key: SeatLayerPickerStringKey, options?: Omit<SeatLayerPickerTranslationOptions, 'locale' | 'overrides'>): string;
  accessNeed(need: SeatLayerPickerAccessNeed, count?: number): string;
}

type SafeOverrides = Readonly<{
  strings: Readonly<Record<string, SeatLayerPickerStringOverride>>;
  accessNeeds: Readonly<Record<string, SeatLayerPickerStringOverride>>;
}>;
type SafeTranslationInputs = Readonly<{
  locale: SeatLayerPickerLocale | null | undefined;
  values: unknown;
  count: unknown;
  overrides: unknown;
}>;

function ownDataEntries(source: unknown): readonly (readonly [string, unknown])[] {
  if (!source || (typeof source !== 'object' && typeof source !== 'function')) return [];
  try {
    return Object.getOwnPropertyNames(source).flatMap((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      return descriptor && 'value' in descriptor ? [[key, descriptor.value] as const] : [];
    });
  } catch {
    return [];
  }
}

function safeStringValues(values: unknown): SeatLayerPickerStringValues {
  const copy = Object.create(null) as Record<string, string | number | undefined>;
  for (const [key, value] of ownDataEntries(values)) {
    if (typeof value === 'string' || typeof value === 'number' || value === undefined) copy[key] = value;
  }
  return Object.freeze(copy);
}

function freezeOverrides(overrides: unknown): SafeOverrides {
  const strings = Object.create(null) as Record<string, SeatLayerPickerStringOverride>;
  const accessNeeds = Object.create(null) as Record<string, SeatLayerPickerStringOverride>;
  for (const [key, value] of ownDataEntries(overrides)) {
    if (key === 'accessNeeds') {
      for (const [need, label] of ownDataEntries(value)) {
        if (typeof label === 'string') accessNeeds[need] = label;
        if (typeof label === 'function') accessNeeds[need] = label as SeatLayerPickerStringFormatter;
      }
    } else if (typeof value === 'string') {
      strings[key] = value;
    } else if (typeof value === 'function') {
      strings[key] = value as SeatLayerPickerStringFormatter;
    }
  }
  return Object.freeze({ strings: Object.freeze(strings), accessNeeds: Object.freeze(accessNeeds) });
}

function translationInputs(options: unknown): SafeTranslationInputs {
  let locale: SeatLayerPickerLocale | null | undefined;
  let values: unknown;
  let count: unknown;
  let overrides: unknown;
  for (const [key, value] of ownDataEntries(options)) {
    if (key === 'locale' && (typeof value === 'string' || value === null || value === undefined)) locale = value;
    if (key === 'values') values = value;
    if (key === 'count') count = value;
    if (key === 'overrides') overrides = value;
  }
  return Object.freeze({ locale, values, count, overrides });
}

function normalizedLocaleCandidates(locale: SeatLayerPickerLocale | null | undefined): readonly string[] {
  if (typeof locale !== 'string') return [];
  const requested = locale.trim().replace(/_/g, '-');
  if (!requested) return [];
  const parts = requested.split('-').filter(Boolean);
  if (!parts.length) return [];
  const language = parts[0]!.toLowerCase();
  const normalized = [language, ...parts.slice(1).map((part) => (
    /^[A-Za-z]{4}$/.test(part) ? `${part[0]!.toUpperCase()}${part.slice(1).toLowerCase()}`
      : /^[A-Za-z]{2}$|^\d{3}$/.test(part) ? part.toUpperCase()
        : part.toLowerCase()
  ))];
  const candidates: string[] = [];
  for (let length = normalized.length; length > 0; length -= 1) candidates.push(normalized.slice(0, length).join('-'));
  if (language === 'zh' && !normalized.some((part) => part === 'Hans' || part === 'Hant')) {
    const traditional = normalized.some((part) => part === 'TW' || part === 'HK' || part === 'MO');
    candidates.splice(Math.max(0, candidates.length - 1), 0, traditional ? 'zh-Hant' : 'zh-Hans');
  }
  return [...new Set(candidates)];
}

function localeDictionary(locale: SeatLayerPickerLocale | null | undefined): Readonly<Record<string, string>> | undefined {
  for (const candidate of normalizedLocaleCandidates(locale)) {
    const exact = seatLayerPickerLocaleStrings[candidate as SeatLayerPickerGeneratedLocale];
    if (exact) return exact;
    const matchingLocale = Object.keys(seatLayerPickerLocaleStrings).find((known) => known.toLowerCase() === candidate.toLowerCase());
    if (matchingLocale) return seatLayerPickerLocaleStrings[matchingLocale as SeatLayerPickerGeneratedLocale];
  }
  return undefined;
}

function pluralCategory(locale: SeatLayerPickerLocale | null | undefined, count: number): string {
  try {
    return new Intl.PluralRules(typeof locale === 'string' ? locale : 'en').select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

function safeKey(key: unknown): string {
  return typeof key === 'string' ? key : '';
}

function keyCandidates(key: string, locale: SeatLayerPickerLocale | null | undefined, count: number | undefined): readonly string[] {
  if (count === undefined || !Number.isFinite(count)) return [key];
  return [...new Set([`${key}.${pluralCategory(locale, count)}`, `${key}.other`, key])];
}

function formatTemplate(template: unknown, values: SeatLayerPickerStringValues): string | undefined {
  if (typeof template !== 'string') return undefined;
  return template.replace(/\{([\w-]+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) return placeholder;
    try {
      return String(value);
    } catch {
      return placeholder;
    }
  });
}

function contextFor(
  key: SeatLayerPickerStringKey,
  locale: SeatLayerPickerLocale | null | undefined,
  count: number | undefined,
  values: SeatLayerPickerStringValues,
): SeatLayerPickerStringContext {
  return Object.freeze({ key, locale, count, values });
}

function resolveOverride(
  overrides: Readonly<Record<string, SeatLayerPickerStringOverride>>,
  candidates: readonly string[],
  context: SeatLayerPickerStringContext,
): string | undefined {
  for (const candidate of candidates) {
    const override = overrides[candidate];
    if (typeof override === 'string') return override;
    if (typeof override === 'function') {
      try {
        const formatted = override(context);
        if (typeof formatted === 'string') return formatted;
      } catch {
        // A host formatter must not take down picker rendering.
      }
    }
  }
  return undefined;
}

function resolvedValues(values: unknown, count: number | undefined): SeatLayerPickerStringValues {
  const copy = { ...safeStringValues(values) } as Record<string, string | number | undefined>;
  if (copy.money === undefined && copy.total !== undefined) copy.money = copy.total;
  if (copy.total === undefined && copy.money !== undefined) copy.total = copy.money;
  if (count !== undefined && Number.isFinite(count)) {
    if (copy.count === undefined) copy.count = count;
    if (copy.n === undefined) copy.n = count;
  }
  return Object.freeze(copy);
}

function englishTemplate(candidates: readonly string[]): string | undefined {
  for (const candidate of candidates) {
    const value = seatLayerPickerEnglishStrings[candidate as SeatLayerPickerEnglishStringKey];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function localizedContinueTemplate(dictionary: Readonly<Record<string, string>> | undefined): string | undefined {
  const word = dictionary?.continueWord;
  return typeof word === 'string' ? `${word} · {money}` : undefined;
}

function translate(
  key: SeatLayerPickerStringKey,
  options: SeatLayerPickerTranslationOptions = {},
  frozenOverrides?: SafeOverrides,
): string {
  const { locale, values, count, overrides } = translationInputs(options);
  const safe = safeKey(key);
  if (!safe) return safe;
  const safeCount = typeof count === 'number' && Number.isFinite(count) ? count : undefined;
  const safeValues = resolvedValues(values, safeCount);
  const candidates = keyCandidates(safe, locale, safeCount);
  const context = contextFor(safe, locale, safeCount, safeValues);
  const safeOverrides = frozenOverrides ?? freezeOverrides(overrides);
  const override = resolveOverride(safeOverrides.strings, candidates, context);
  const dictionary = localeDictionary(locale);
  const template = override
    ?? (safe === 'continueWithTotal' ? localizedContinueTemplate(dictionary) : undefined)
    ?? (dictionary ? candidates.map((candidate) => dictionary[candidate]) : [])
      .find((value): value is string => typeof value === 'string')
    ?? englishTemplate(candidates);
  return formatTemplate(template, safeValues) ?? safe;
}

/** Replaces supplied named placeholders while preserving a placeholder with no safe value. */
export function formatSeatLayerPickerString(template: string, values: SeatLayerPickerStringValues = {}): string {
  return formatTemplate(template, safeStringValues(values)) ?? '';
}

/**
 * Finds an exact locale, then its language (including Chinese script fallback),
 * then the generated English overlay, then typed English native wording.
 */
export function translateSeatLayerPickerString(
  key: SeatLayerPickerStringKey,
  options: SeatLayerPickerTranslationOptions = {},
): string {
  return translate(key, options);
}

/** Creates an immutable lookup layer for picker scope and standalone chrome. */
export function createSeatLayerPickerStringResolver(
  options: Pick<SeatLayerPickerTranslationOptions, 'locale' | 'overrides'> = {},
): SeatLayerPickerStringResolver {
  const input = translationInputs(options);
  const locale = input.locale;
  const overrides = freezeOverrides(input.overrides);
  return Object.freeze({
    locale,
    translate: (
      key: SeatLayerPickerStringKey,
      translationOptions: Omit<SeatLayerPickerTranslationOptions, 'locale' | 'overrides'> = {},
    ) => {
      const nested = translationInputs(translationOptions);
      return translate(key, {
        locale,
        values: nested.values as SeatLayerPickerStringValues | undefined,
        count: typeof nested.count === 'number' ? nested.count : undefined,
      }, overrides);
    },
    accessNeed: (need: SeatLayerPickerAccessNeed, count?: number) => {
      const safeNeed = safeKey(need);
      const values = resolvedValues({ need: safeNeed }, count);
      const label = resolveOverride(overrides.accessNeeds, [safeNeed], contextFor(safeNeed, locale, count, values))
        ?? seatLayerPickerEnglishAccessNeeds[safeNeed as SeatLayerPickerKnownAccessNeed]
        ?? safeNeed;
      return count === undefined || !Number.isFinite(count)
        ? label
        : translate('accessNeedWithCount', { locale, count, values: { need: label, count } }, overrides);
    },
  });
}
