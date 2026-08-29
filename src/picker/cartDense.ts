/**
 * Pure cart shaping for a dense native picker list.
 *
 * This module intentionally does not decode snapshots or format money. Its
 * inputs are the cart and selection shapes after the bridge has validated
 * them, and its outputs are plain data a React Native surface can render.
 */

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
 * These are deliberately the values used as the dense run key.
 */
export interface DenseTicketDisplayEnrichment {
  readonly section?: string | null;
  readonly rowLabel?: string | null;
  readonly seatLabel?: string | null;
  readonly categoryLabel?: string | null;
  readonly amountText?: string | null;
}

export interface ResolveDenseTicketLineOptions {
  readonly held?: boolean;
  readonly display?: DenseTicketDisplayEnrichment;
}

export interface ResolveDenseTicketLinesOptions<T extends SeatLayerCartLineLike> {
  readonly held?: boolean;
  readonly displayForItem?: (item: T) => DenseTicketDisplayEnrichment | undefined;
}

export interface DenseTicketLine<T extends SeatLayerCartLineLike = SeatLayerCartLineLike> {
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
  readonly groupable: boolean;
}

export interface DenseTicketRun<T extends SeatLayerCartLineLike = SeatLayerCartLineLike> {
  readonly members: readonly DenseTicketLine<T>[];
  readonly seatsLabel: string;
  readonly total: number | null;
  readonly quantity: number;
  readonly isGroup: boolean;
}

export interface CartTotalsProjection {
  readonly quantity: number;
  readonly total: number;
  /** Null prevents a UI from presenting a cross-currency sum as one amount. */
  readonly currency: string | null;
  readonly hasMixedCurrencies: boolean;
}

export interface VisibleRunProjection<T extends SeatLayerCartLineLike = SeatLayerCartLineLike> {
  readonly visible: readonly DenseTicketRun<T>[];
  readonly hiddenCount: number;
  readonly canToggle: boolean;
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
export function resolveDenseTicketLine<T extends SeatLayerCartLineLike>(
  item: T,
  selection: readonly SeatLayerSelectedSeatLike[] = [],
  options: ResolveDenseTicketLineOptions = {},
): DenseTicketLine<T> {
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
  const rowLabel = firstKnown(display?.rowLabel, item.rowLabel)
    ?? nonBlank(selected?.rowLabel)
    ?? '';
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
  const tierOptionCount = selected?.tierOptionCount ?? selected?.tiers?.length;

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
    // The runtime treats its object type as an open enum: only GA is known to
    // carry a quantity control by contract. Booth and future objects preserve
    // their type and retain the same dense-list rule.
    groupable: item.objectType !== 'ga'
      && quantity <= 1
      && (tierOptionCount == null || tierOptionCount <= 1)
      && identity.removalLabel !== null,
  };
}

export function resolveDenseTicketLines<T extends SeatLayerCartLineLike>(
  items: readonly T[],
  selection: readonly SeatLayerSelectedSeatLike[] = [],
  options: ResolveDenseTicketLinesOptions<T> = {},
): readonly DenseTicketLine<T>[] {
  return items.map((item) => resolveDenseTicketLine(item, selection, {
    held: options.held,
    display: options.displayForItem?.(item),
  }));
}

/** Formats a truthful compact seat list; it never fills gaps with a range. */
export function formatSeatRunLabel(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0] ?? '';

  const numbered = labels.map(seatNumber);
  if (numbered.every((value): value is number => value !== null)) {
    const sorted = [...numbered].sort((left, right) => left - right);
    const consecutive = sorted.every(
      (value, index) => index === 0 || value === (sorted[index - 1] ?? value) + 1,
    );
    if (consecutive) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
    return compactLabel(sorted.map(String));
  }
  return compactLabel(labels);
}

/** Fold only neighbouring lines whose buyer-facing run key matches. */
export function groupDenseTicketLines<T extends SeatLayerCartLineLike>(
  lines: readonly DenseTicketLine<T>[],
): readonly DenseTicketRun<T>[] {
  const groups: DenseTicketLine<T>[][] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last !== undefined && canJoinDenseTicketLines(last[0]!, line)) {
      last.push(line);
    } else {
      groups.push([line]);
    }
  }
  return groups.map((members) => makeRun(members));
}

/** The expanded order mirrors the compact numeric label, otherwise pick order. */
export function runMembersInSeatOrder<T extends SeatLayerCartLineLike>(
  run: DenseTicketRun<T>,
): readonly DenseTicketLine<T>[] {
  const numbered = run.members.map((member) => seatNumber(member.seatLabel));
  if (!numbered.every((value): value is number => value !== null)) return run.members;
  return run.members
    .map((member, index) => ({ member, index, number: numbered[index]! }))
    .sort((left, right) => left.number - right.number || left.index - right.index)
    .map(({ member }) => member);
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

export function projectVisibleRuns<T extends SeatLayerCartLineLike>(
  runs: readonly DenseTicketRun<T>[],
  visibleLimit: number,
  expanded: boolean,
): VisibleRunProjection<T> {
  const limit = Number.isFinite(visibleLimit) ? Math.max(0, Math.floor(visibleLimit)) : 0;
  const hiddenCount = expanded ? 0 : Math.max(0, runs.length - limit);
  return {
    visible: hiddenCount === 0 ? runs : runs.slice(0, limit),
    hiddenCount,
    canToggle: runs.length > limit,
  };
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

function canJoinDenseTicketLines<T extends SeatLayerCartLineLike>(
  left: DenseTicketLine<T>,
  right: DenseTicketLine<T>,
): boolean {
  return left.groupable
    && right.groupable
    && left.held === right.held
    && left.section === right.section
    && left.rowLabel === right.rowLabel
    && left.categoryLabel === right.categoryLabel
    && left.amountText === right.amountText;
}

function makeRun<T extends SeatLayerCartLineLike>(members: readonly DenseTicketLine<T>[]): DenseTicketRun<T> {
  const total = members.every((member) => member.total !== null)
    ? members.reduce((sum, member) => sum + member.total!, 0)
    : null;
  return {
    members,
    seatsLabel: formatSeatRunLabel(members.map((member) => member.seatLabel)),
    total,
    quantity: members.reduce((sum, member) => sum + member.quantity, 0),
    isGroup: members.length > 1,
  };
}

function compactLabel(labels: readonly string[]): string {
  const shown = labels.slice(0, 3).join(', ');
  return labels.length > 3 ? `${shown} +${labels.length - 3}` : shown;
}

function seatNumber(label: string): number | null {
  const trimmed = label.trim();
  return /^[0-9]{1,4}$/.test(trimmed) ? Number(trimmed) : null;
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
