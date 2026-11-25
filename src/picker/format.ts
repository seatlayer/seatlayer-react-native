export type SeatLayerPickerMoneyFormatter = (amount: number, currency: string) => string;
export type SeatLayerPickerFormatterErrorHandler = (error: unknown) => void;

const currencySymbols: Readonly<Record<string, string>> = Object.freeze({
  EUR: '€',
  USD: '$',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
});

const rowPrefixSeparators = Object.freeze(['-', '·', '/', ' ', '–', '—']);

function safeAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function safeCurrency(value: unknown): string {
  if (typeof value !== 'string') return 'USD';
  const code = value.trim().toUpperCase();
  return code || 'USD';
}

/** Currencies whose amounts are not written with two decimals. */
const noDecimals: ReadonlySet<string> = new Set((
  'AFN ALL BIF CLP COP DJF GNF HUF IDR IQD IRR ISK JPY KMF KPW KRW LAK LBP MGA MMK PKR PYG RWF '
  + 'SLL SOS SYP UGX VND VUV XAF XOF XPF YER'
).split(' '));
const threeDecimals: ReadonlySet<string> = new Set(['BHD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** A whole amount has no decimals; any other has as many as its currency has. */
function moneyDigits(amount: number, currency: string): number {
  if (Number.isInteger(amount) || noDecimals.has(currency)) return 0;
  return threeDecimals.has(currency) ? 3 : 2;
}

/** English marks, for an engine with no number formats and for a code it does not take. */
function plainMoney(amount: number, currency: string, digits: number): string {
  const [whole = '0', decimals] = Math.abs(amount).toFixed(digits).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, ',');
  const value = decimals === undefined ? grouped : `${grouped}.${decimals}`;
  const symbol = Object.prototype.hasOwnProperty.call(currencySymbols, currency)
    ? currencySymbols[currency] as string
    : `${currency}\u00A0`;
  return `${amount < 0 ? '-' : ''}${symbol}${value}`;
}

// An engine takes long to make a number format, and a price list asks for the
// same few on every draw.
const numberFormats = new Map<string, Intl.NumberFormat | undefined>();

function numberFormat(locale: string, currency: string, digits: number): Intl.NumberFormat | undefined {
  const key = `${locale}|${currency}|${digits}`;
  if (numberFormats.has(key)) return numberFormats.get(key);
  let format: Intl.NumberFormat | undefined;
  try {
    format = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      // Engines differ in the digits they give Arabic; the map writes 0 to 9.
      ...(locale.toLowerCase() === 'ar' ? { numberingSystem: 'latn' } : {}),
    });
  } catch {
    // No number formats in this engine, or a code or a language it does not take.
  }
  if (numberFormats.size > 200) numberFormats.clear();
  numberFormats.set(key, format);
  return format;
}

function reportFormatterError(callback: unknown, error: unknown): void {
  if (typeof callback !== 'function') return;
  try {
    callback(error);
  } catch {
    // A reporting callback is observational and cannot interrupt rendering.
  }
}

/** Writes a finite amount as `locale` writes the currency, English when none is given. */
export function formatSeatLayerPickerCompactMoney(
  amount: number,
  currency: string,
  locale?: string | null,
): string {
  const value = safeAmount(amount);
  const code = safeCurrency(currency);
  const digits = moneyDigits(value, code);
  try {
    const language = typeof locale === 'string' && locale.trim() ? locale.trim() : 'en';
    const text = (numberFormat(language, code, digits) ?? numberFormat('en', code, digits))?.format(value);
    if (typeof text === 'string' && text.trim()) return text;
  } catch {
    // Written plainly below.
  }
  return plainMoney(value, code, digits);
}

/** Uses a host formatter when it safely returns visible text, otherwise the currency as `locale` writes it. */
export function formatSeatLayerPickerMoney(
  amount: number,
  currency: string,
  formatter?: SeatLayerPickerMoneyFormatter,
  onFormatterError?: SeatLayerPickerFormatterErrorHandler,
  locale?: string | null,
): string {
  const safeAmountValue = safeAmount(amount);
  const safeCurrencyCode = safeCurrency(currency);
  if (typeof formatter !== 'function') {
    return formatSeatLayerPickerCompactMoney(safeAmountValue, safeCurrencyCode, locale);
  }
  try {
    const formatted = formatter(safeAmountValue, safeCurrencyCode);
    if (typeof formatted === 'string' && formatted.trim()) return formatted;
    reportFormatterError(onFormatterError, new Error('SeatLayer picker money formatter returned blank text.'));
  } catch (error) {
    reportFormatterError(onFormatterError, error);
  }
  return formatSeatLayerPickerCompactMoney(safeAmountValue, safeCurrencyCode, locale);
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function withoutLeadingSeparator(value: string): string {
  let rest = value.trim();
  while (rest && rowPrefixSeparators.includes(rest[0]!)) rest = rest.slice(1).trim();
  return rest;
}

function splitLeadingToken(row: string): readonly [string, string] | undefined {
  for (let index = 0; index < row.length; index += 1) {
    if (!rowPrefixSeparators.includes(row[index]!)) continue;
    return [row.slice(0, index), withoutLeadingSeparator(row.slice(index))];
  }
  return undefined;
}

function namesSection(head: string, section: string, code: string): boolean {
  if (!head) return false;
  const upper = head.toUpperCase();
  if (code && upper === code.toUpperCase()) return true;
  if (!section) return false;
  if (upper === section.toUpperCase()) return true;
  if (head !== upper || head.length < 2 || !/[A-Z]/.test(head)) return false;
  return section.toUpperCase().replaceAll(' ', '').startsWith(upper);
}

/**
 * Removes the repeated section portion from a chart-authored row label while
 * preserving bare rows and section-only labels exactly as authored.
 */
export function normalizeSeatLayerPickerRowLabel(
  rowLabel: string,
  sectionLabel: string,
  sectionCode?: string,
): string {
  const row = safeText(rowLabel);
  const section = safeText(sectionLabel);
  const code = safeText(sectionCode);
  if (!row) return row;
  if (section && row.toLowerCase().startsWith(section.toLowerCase())) {
    const rest = withoutLeadingSeparator(row.slice(section.length));
    if (rest) return rest;
  }
  const split = splitLeadingToken(row);
  if (!split) return row;
  const [head, rest] = split;
  if (!rest) return row;
  return namesSection(head, section, code) ? rest : row;
}
