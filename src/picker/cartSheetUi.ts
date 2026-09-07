import type { SeatLayerPickerCartLine, SeatLayerPickerSnapshot } from './models';
import {
  projectCartTotals,
  projectConfirmedCart,
  resolveSeatLayerTicketLines,
  type SeatLayerTicketLine,
  type ConfirmedCartProjection,
} from './cartLines';
import { seatLayerPickerTokens } from './tokens.g';

/** The cart-sheet's snapshot-only buyer projection.  Pending confirmation is never a ticket. */
export interface SeatLayerCartSheetProjection {
  readonly confirmed: ConfirmedCartProjection<SeatLayerPickerCartLine>;
  readonly totals: ReturnType<typeof projectCartTotals>;
  readonly lines: readonly SeatLayerTicketLine<SeatLayerPickerCartLine>[];
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
): readonly SeatLayerTicketLine<SeatLayerPickerCartLine>[] {
  return resolveSeatLayerTicketLines(items, snapshot?.selection ?? [], {
    held: snapshot?.hold.owner === 'host',
    displayForItem: (item) => ({
      section: item.sectionLabel,
      rowLabel: item.rowLabel,
      seatLabel: item.seatNumber ?? item.displayLabel ?? item.label,
      categoryLabel: snapshot?.categories.find((category) => category.key === item.categoryKey)?.label ?? item.categoryKey,
    }),
  });
}

/**
 * The two ceilings the cart region is drawn under (spec §3.10.1).
 *
 * Both are a fraction of the screen capped at a fixed height: a tall phone
 * must not give three quarters of itself to a cart, and a short one must not
 * be told that seventy-two per cent is enough. `chromeHeight` is everything
 * that is NOT the cart region — the head, the measured foot and the safe inset
 * — measured rather than assumed, because the foot grows with the platform's
 * text size, with a lapse notice and with an inline error, and a cap derived
 * from a guess would clip the button rather than the list.
 */
export function seatLayerCartSheetCeilings(
  viewportHeight: unknown,
  chromeHeight: unknown,
  hasTickets: boolean,
  layout: Readonly<Record<string, number>> = seatLayerPickerTokens.size,
): Readonly<{ body: number; full: number }> {
  const viewport = finiteNonNegative(viewportHeight);
  const chrome = finiteNonNegative(chromeHeight);
  const ceiling = hasTickets
    ? Math.min(
      viewport * (layout.sheetMaxHeightFraction ?? seatLayerPickerTokens.size.sheetMaxHeightFraction),
      layout.sheetMaxHeight ?? seatLayerPickerTokens.size.sheetMaxHeight,
    )
    : Math.min(
      viewport * (layout.emptyTrayMaxHeightFraction ?? seatLayerPickerTokens.size.emptyTrayMaxHeightFraction),
      layout.emptyTrayMaxHeight ?? seatLayerPickerTokens.size.emptyTrayMaxHeight,
    );
  const fullCeiling =
    viewport * (layout.sheetFullHeightFraction ?? seatLayerPickerTokens.size.sheetFullHeightFraction);
  return Object.freeze({
    body: Math.min(Math.max(0, ceiling - chrome), viewport),
    full: Math.min(Math.max(0, fullCeiling - chrome), viewport),
  });
}

/**
 * The seats a collapsed sheet lists under its count, in the runtime's own
 * inventory labels: `A-12` reads as `A · 12`, and the line opens the cards.
 */
export function seatLayerCartSeatsLine(
  lines: readonly Readonly<{ label?: string | null }>[],
): string {
  return lines
    .map((line) => (line.label ?? '').trim().replace(/-/g, ' \u00b7 '))
    .filter((label) => label.length > 0)
    .join(',  ');
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
