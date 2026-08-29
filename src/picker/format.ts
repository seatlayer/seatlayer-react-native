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

function safeFixed(amount: number): string {
  try {
    return amount.toFixed(Number.isInteger(amount) ? 0 : 2);
  } catch {
    return '0';
  }
}

function reportFormatterError(callback: unknown, error: unknown): void {
  if (typeof callback !== 'function') return;
  try {
    callback(error);
  } catch {
    // A reporting callback is observational and cannot interrupt rendering.
  }
}

/** Formats a finite amount with a known symbol or a normalized currency-code prefix. */
export function formatSeatLayerPickerCompactMoney(amount: number, currency: string): string {
  const safeCurrencyCode = safeCurrency(currency);
  const value = safeFixed(safeAmount(amount));
  const symbol = currencySymbols[safeCurrencyCode];
  return symbol === undefined ? `${safeCurrencyCode} ${value}` : `${symbol}${value}`;
}

/** Uses a host formatter when it safely returns visible text, otherwise the compact picker format. */
export function formatSeatLayerPickerMoney(
  amount: number,
  currency: string,
  formatter?: SeatLayerPickerMoneyFormatter,
  onFormatterError?: SeatLayerPickerFormatterErrorHandler,
): string {
  const safeAmountValue = safeAmount(amount);
  const safeCurrencyCode = safeCurrency(currency);
  if (typeof formatter !== 'function') {
    return formatSeatLayerPickerCompactMoney(safeAmountValue, safeCurrencyCode);
  }
  try {
    const formatted = formatter(safeAmountValue, safeCurrencyCode);
    if (typeof formatted === 'string' && formatted.trim()) return formatted;
    reportFormatterError(onFormatterError, new Error('SeatLayer picker money formatter returned blank text.'));
  } catch (error) {
    reportFormatterError(onFormatterError, error);
  }
  return formatSeatLayerPickerCompactMoney(safeAmountValue, safeCurrencyCode);
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
