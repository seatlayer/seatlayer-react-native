/**
 * Pure cart shaping for the native picker's cart cards (spec §3.10.2).
 *
 * This module intentionally does not decode snapshots or format money. Its
 * inputs are the cart and selection shapes after the bridge has validated
 * them, and its outputs are plain data a React Native surface can render.
 *
 * ONE CARD PER TICKET. The folded dense list this used to shape — consecutive
 * seats gathered into runs behind a `+N more` — went with the `dense*` tokens:
 * the collapsed sheet caps the list at three cards and scrolls instead, which
 * is the same answer folding gave without a second design.
 */

import { normalizeSeatLayerPickerRowLabel } from './format';

export interface SeatLayerCartLineLike {
  readonly lineKey?: string | null;
  /** Runtime inventory identity; this is the value used for remove/undo. */
  readonly label?: string | null;
  readonly displayLabel?: string | null;
  readonly objectId?: string | null;
  /** Deliberately open: future runtime object types must pass through intact. */
  readonly objectType?: string | null;
  readonly categoryKey?: string | null;
  readonly tierId?: string | null;
  readonly unitPrice?: number | null;
  readonly currency?: string | null;
  readonly quantity?: number | null;
  readonly seatId?: string | null;
  readonly sectionLabel?: string | null;
  readonly rowLabel?: string | null;
  readonly seatNumber?: string | null;
}

export interface SeatLayerSelectedSeatLike {
  readonly id?: string | null;
  readonly label?: string | null;
  readonly objectId?: string | null;
  readonly sectionLabel?: string | null;
  readonly rowLabel?: string | null;
  readonly seatNumber?: string | null;
  /** Number of selectable tiers, when the selection contract exposes it. */
  readonly tierOptionCount?: number | null;
  /** Runtime-selected seat contract; retained as an open payload shape. */
  readonly tiers?: readonly unknown[] | null;
}

export interface TicketIdentity {
  readonly lineKey: string | null;
  readonly removalLabel: string | null;
  readonly objectId: string | null;
  readonly seatId: string | null;
}

/**
 * Render values supplied by the native picker surface after it has applied
 * category lookup, row normalization, and locale-specific money formatting.
 */
export interface SeatLayerTicketDisplay {
  readonly section?: string | null;
  readonly rowLabel?: string | null;
  readonly seatLabel?: string | null;
  readonly categoryLabel?: string | null;
  readonly amountText?: string | null;
}

export interface ResolveSeatLayerTicketLineOptions {
  readonly held?: boolean;
  readonly display?: SeatLayerTicketDisplay;
}

export interface ResolveSeatLayerTicketLinesOptions<T extends SeatLayerCartLineLike> {
  readonly held?: boolean;
  readonly displayForItem?: (item: T) => SeatLayerTicketDisplay | undefined;
}

export interface SeatLayerTicketLine<T extends SeatLayerCartLineLike = SeatLayerCartLineLike> {
  readonly item: T;
  readonly identity: TicketIdentity;
  readonly selection: SeatLayerSelectedSeatLike | null;
  readonly section: string;
  readonly rowLabel: string;
  readonly seatLabel: string;
  readonly categoryLabel: string;
  readonly amountText: string;
  readonly categoryKey: string | null;
  readonly tierId: string | null;
  readonly unitPrice: number | null;
  readonly currency: string | null;
  readonly quantity: number;
  readonly total: number | null;
  readonly held: boolean;
}

export interface CartTotalsProjection {
  readonly quantity: number;
  readonly total: number;
  /** Null prevents a UI from presenting a cross-currency sum as one amount. */
  readonly currency: string | null;
  readonly hasMixedCurrencies: boolean;
}

export interface ConfirmedCartProjection<T extends SeatLayerCartLineLike = SeatLayerCartLineLike> {
  readonly items: readonly T[];
  readonly quantity: number;
  readonly total: number;
}

/** The explicit identity fields a command layer needs; it never guesses a label. */
export function ticketIdentityOf(line: SeatLayerCartLineLike): TicketIdentity {
  return {
    lineKey: nonBlank(line.lineKey),
    removalLabel: nonBlank(line.label),
    objectId: nonBlank(line.objectId),
    seatId: nonBlank(line.seatId),
  };
}

/**
 * Resolve a cart line's seat without making an ambiguous label match.
 * Cart-owned address fields win, since Best Available and resumed holds do
 * not necessarily remain in renderer selection.
 */
export function resolveSeatLayerTicketLine<T extends SeatLayerCartLineLike>(
  item: T,
  selection: readonly SeatLayerSelectedSeatLike[] = [],
  options: ResolveSeatLayerTicketLineOptions = {},
): SeatLayerTicketLine<T> {
  const identity = ticketIdentityOf(item);
  const selected = selectionBehind(item, selection);
  const display = options.display;
  const categoryKey = nonBlank(item.categoryKey);
  const section = firstKnown(display?.section, item.sectionLabel)
    ?? nonBlank(selected?.sectionLabel)
    ?? nonBlank(display?.categoryLabel)
    ?? categoryKey
    ?? nonBlank(item.displayLabel)
    ?? identity.removalLabel
    ?? '';
  // Print the row with its section prefix stripped, the way the seat card
  // does: a chart that authors `206-I` makes the line read `206 · 206-I · 4`,
  // which says the section twice and the row not at all.
  const authoredRow = firstKnown(display?.rowLabel, item.rowLabel)
    ?? nonBlank(selected?.rowLabel)
    ?? '';
  const rowLabel = normalizeSeatLayerPickerRowLabel(authoredRow, section);
  const seatLabel = firstKnown(display?.seatLabel, item.seatNumber)
    ?? nonBlank(selected?.seatNumber)
    ?? nonBlank(item.displayLabel)
    ?? identity.removalLabel
    ?? identity.objectId
    ?? '';
  const quantity = validQuantity(item.quantity);
  const unitPrice = finiteNumber(item.unitPrice);
  const total = unitPrice === null ? null : unitPrice * quantity;
  const currency = nonBlank(item.currency);
  const categoryLabel = nonBlank(display?.categoryLabel) ?? categoryKey ?? '';
  // When a surface has not supplied localized money yet, preserve enough
  // information to avoid treating unlike currency amounts as identical.
  const amountText = nonBlank(display?.amountText)
    ?? (total === null ? '' : currency === null ? String(total) : `${currency} · ${total}`);
  return {
    item,
    identity,
    selection: selected,
    section,
    rowLabel,
    seatLabel,
    categoryLabel,
    amountText,
    categoryKey,
    tierId: nullableText(item.tierId),
    unitPrice,
    currency,
    quantity,
    total,
    held: options.held === true,
  };
}

export function resolveSeatLayerTicketLines<T extends SeatLayerCartLineLike>(
  items: readonly T[],
  selection: readonly SeatLayerSelectedSeatLike[] = [],
  options: ResolveSeatLayerTicketLinesOptions<T> = {},
): readonly SeatLayerTicketLine<T>[] {
  return items.map((item) => resolveSeatLayerTicketLine(item, selection, {
    held: options.held,
    display: options.displayForItem?.(item),
  }));
}

export function projectCartTotals(items: readonly SeatLayerCartLineLike[]): CartTotalsProjection {
  let quantity = 0;
  let total = 0;
  const currencies = new Set<string>();
  for (const item of items) {
    const itemQuantity = validQuantity(item.quantity);
    quantity += itemQuantity;
    const unitPrice = finiteNumber(item.unitPrice);
    if (unitPrice !== null) total += unitPrice * itemQuantity;
    const currency = nonBlank(item.currency);
    if (currency !== null) currencies.add(currency);
  }
  return {
    quantity,
    total,
    currency: currencies.size === 1 ? [...currencies][0] ?? null : null,
    hasMixedCurrencies: currencies.size > 1,
  };
}

/**
 * The runtime snapshot already includes a newly tapped seat. Until that seat
 * has answered its local confirmation card, expose every other cart line as
 * the buyer's committed cart. The comparison is evaluated per line:
 * a line carrying `seatId` compares it to pending `id`; every legacy line
 * without one compares its inventory label to pending `label`.
 */
export function projectConfirmedCart<T extends SeatLayerCartLineLike>(
  items: readonly T[],
  pending: SeatLayerSelectedSeatLike | null | undefined,
): ConfirmedCartProjection<T> {
  if (pending === null || pending === undefined) return totalsForItems(items);
  const pendingSeatId = nonBlank(pending.id);
  const pendingLabel = nonBlank(pending.label);
  return totalsForItems(items.filter((item) => {
    const identity = ticketIdentityOf(item);
    return identity.seatId === null
      ? identity.removalLabel !== pendingLabel
      : identity.seatId !== pendingSeatId;
  }));
}

function selectionBehind(
  item: SeatLayerCartLineLike,
  selection: readonly SeatLayerSelectedSeatLike[],
): SeatLayerSelectedSeatLike | null {
  const identity = ticketIdentityOf(item);
  return uniqueMatch(selection, (seat) => identity.seatId !== null && nonBlank(seat.id) === identity.seatId)
    ?? uniqueMatch(selection, (seat) => identity.removalLabel !== null && nonBlank(seat.label) === identity.removalLabel)
    ?? uniqueMatch(selection, (seat) => identity.objectId !== null && nonBlank(seat.objectId) === identity.objectId)
    ?? uniqueMatch(selection, (seat) => identity.objectId !== null && nonBlank(seat.id) === identity.objectId);
}

function uniqueMatch<T>(values: readonly T[], predicate: (value: T) => boolean): T | null {
  let match: T | null = null;
  for (const value of values) {
    if (!predicate(value)) continue;
    if (match !== null) return null;
    match = value;
  }
  return match;
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

/** Unlike nonBlank, null is an explicit no-tier value and can safely compare. */
function nullableText(value: string | null | undefined): string | null {
  return nonBlank(value);
}

function firstKnown(primary: string | null | undefined, fallback: string | null | undefined): string | null {
  return nonBlank(primary) ?? nonBlank(fallback);
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function validQuantity(value: number | null | undefined): number {
  // Picker decoding supplies one when quantity is omitted. Explicit malformed,
  // fractional, and non-positive values are normalized to zero so totals and
  // count projections never charge a phantom ticket.
  if (value === null || value === undefined) return 1;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

function totalsForItems<T extends SeatLayerCartLineLike>(items: readonly T[]): ConfirmedCartProjection<T> {
  const projection = projectCartTotals(items);
  return { items, quantity: projection.quantity, total: projection.total };
}
