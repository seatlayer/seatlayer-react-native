import type { SeatLayerPickerCartLine, SeatLayerPickerSnapshot } from './models';
import {
  projectCartTotals,
  projectConfirmedCart,
  resolveDenseTicketLines,
  type DenseTicketLine,
  type ConfirmedCartProjection,
} from './cartDense';
import { seatLayerPickerTokens } from './tokens.g';

/** The cart-sheet's snapshot-only buyer projection.  Pending confirmation is never a ticket. */
export interface SeatLayerCartSheetProjection {
  readonly confirmed: ConfirmedCartProjection<SeatLayerPickerCartLine>;
  readonly totals: ReturnType<typeof projectCartTotals>;
  readonly lines: readonly DenseTicketLine<SeatLayerPickerCartLine>[];
}

export function projectSeatLayerCartSheet(
  snapshot: SeatLayerPickerSnapshot | undefined,
  pending: { readonly id?: string | null; readonly label?: string | null; readonly objectId?: string | null } | null,
): SeatLayerCartSheetProjection {
  const confirmed = projectConfirmedCart(snapshot?.cartLines ?? [], pending ?? undefined);
  return Object.freeze({
    confirmed,
    totals: projectCartTotals(confirmed.items),
    lines: projectSeatLayerCartLines(snapshot, confirmed.items),
  });
}

/** Re-resolves the currently renderable authoritative lines after an immediate local removal. */
export function projectSeatLayerCartLines(
  snapshot: SeatLayerPickerSnapshot | undefined,
  items: readonly SeatLayerPickerCartLine[],
): readonly DenseTicketLine<SeatLayerPickerCartLine>[] {
  return resolveDenseTicketLines(items, snapshot?.selection ?? [], {
    held: snapshot?.hold.owner === 'host',
    displayForItem: (item) => ({
      section: item.sectionLabel,
      rowLabel: item.rowLabel,
      seatLabel: item.seatNumber ?? item.displayLabel ?? item.label,
      categoryLabel: snapshot?.categories.find((category) => category.key === item.categoryKey)?.label ?? item.categoryKey,
    }),
  });
}

/** The cheapest ticket the chart still sells, for the empty bar's `From` line. */
export function seatLayerCartCheapestPrice(
  snapshot: SeatLayerPickerSnapshot | undefined,
): number | undefined {
  return snapshot?.categories.reduce<number | undefined>(
    (lowest, category) => !category.notForSale && Number.isFinite(category.priceMin)
      ? Math.min(lowest ?? category.priceMin, category.priceMin)
      : lowest,
    undefined,
  );
}

export function cartSheetMaximumBodyHeight(
  viewportHeight: unknown,
  bottomInset: unknown,
  peekHeight: unknown = seatLayerPickerTokens.size.peekHeight,
): number {
  const viewport = finiteNonNegative(viewportHeight);
  const inset = finiteNonNegative(bottomInset);
  const peek = finiteNonNegative(peekHeight);
  const maxSheet = viewport * seatLayerPickerTokens.size.sheetMaxHeightFraction;
  return Math.max(0, maxSheet - peek - inset);
}

export function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function currentScopeSnapshot(
  controller: { getSnapshot(): SeatLayerPickerSnapshot | undefined },
  sessionId: number,
  scopeSessionId: number,
): SeatLayerPickerSnapshot | undefined {
  if (sessionId !== scopeSessionId) return undefined;
  const snapshot = controller.getSnapshot();
  return snapshot === undefined ? undefined : snapshot;
}

/** Captures the three identities an async cart action must not outlive. */
export interface SeatLayerCartActionLease {
  readonly controller: { getSnapshot(): SeatLayerPickerSnapshot | undefined };
  readonly scopeSessionId: number;
  readonly snapshotSessionId: string;
}

export function captureSeatLayerCartActionLease(
  controller: { getSnapshot(): SeatLayerPickerSnapshot | undefined },
  scopeSessionId: number,
): SeatLayerCartActionLease | undefined {
  const snapshot = controller.getSnapshot();
  return snapshot === undefined ? undefined : Object.freeze({
    controller,
    scopeSessionId,
    snapshotSessionId: snapshot.sessionId,
  });
}

export function isSeatLayerCartActionCurrent(
  lease: SeatLayerCartActionLease,
  current: { readonly controller: unknown; readonly sessionId: number },
): boolean {
  return current.controller === lease.controller && current.sessionId === lease.scopeSessionId &&
    lease.controller.getSnapshot()?.sessionId === lease.snapshotSessionId;
}
