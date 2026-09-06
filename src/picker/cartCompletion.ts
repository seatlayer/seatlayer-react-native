import type { SelectedSeat } from '../types';
import type { SeatLayerPickerCartLine } from './models';

/**
 * A cart line for a seat the runtime SELECTED but did not put in its cart.
 *
 * Nothing here is invented: the seat carries its own address, category and
 * price. A seat with no price of its own becomes a line at zero, which the
 * runtime's own hold corrects the moment the hold is replaced.
 */
export function seatLayerPickerCartLineFromSelectedSeat(
  seat: SelectedSeat,
): SeatLayerPickerCartLine {
  const objectId = seat.objectId ?? seat.id;
  return Object.freeze({
    lineKey: objectId,
    label: seat.label,
    objectId,
    objectType: seat.objectType ?? 'seat',
    categoryKey: seat.categoryKey ?? '',
    unitPrice: typeof seat.price === 'number' && Number.isFinite(seat.price) ? seat.price : 0,
    currency: seat.currency ?? 'USD',
    quantity: typeof seat.quantity === 'number' && Number.isFinite(seat.quantity) && seat.quantity > 0
      ? Math.trunc(seat.quantity)
      : 1,
    seatId: seat.id,
    ...(seat.displayLabel === undefined ? {} : { displayLabel: seat.displayLabel }),
    ...(seat.displayType === undefined ? {} : { displayType: seat.displayType }),
    ...(seat.tierId === undefined ? {} : { tierId: seat.tierId }),
    ...(seat.sectionLabel === undefined ? {} : { sectionLabel: seat.sectionLabel }),
    ...(seat.rowLabel === undefined ? {} : { rowLabel: seat.rowLabel }),
    ...(seat.seatNumber === undefined ? {} : { seatNumber: seat.seatNumber }),
  });
}

export interface SeatLayerPickerCompletedCart {
  readonly lines: readonly SeatLayerPickerCartLine[];
  /**
   * Whether a line was added here. The runtime's own quantity and total
   * describe the lines IT reported, so once this is true they are recounted
   * from the lines themselves.
   */
  readonly completed: boolean;
}

/**
 * SEATS ADDED AFTER CHECKOUT (Flutter 0.9.1).
 *
 * A runtime with a live hold reports the HOLD's lines as the cart and drops a
 * seat the buyer has selected since (runtime ≤ 0.84.1 on the CDN): back from
 * checkout, every new seat was drawn selected on the map and missing from the
 * cart, so the tray said one ticket while the map showed two. The seat is a
 * fact the same snapshot still carries, so the cart is completed from it here.
 *
 * The runtime's own fix — listing those seats in its snapshot — is on the
 * runtime's main branch after the 0.84.1 tag. This stays correct either way:
 * a runtime that reports the seat reports it under the same label, so nothing
 * is added twice.
 */
export function completeSeatLayerPickerCartLines(
  reported: readonly SeatLayerPickerCartLine[],
  selected: readonly SelectedSeat[],
): SeatLayerPickerCompletedCart {
  const reportedLabels = new Set(reported.map((line) => line.label));
  const missing: SeatLayerPickerCartLine[] = [];
  for (const seat of selected) {
    if (typeof seat.label !== 'string' || !seat.label) continue;
    if (reportedLabels.has(seat.label)) continue;
    // A selection that repeats a label is one seat, not two.
    reportedLabels.add(seat.label);
    missing.push(seatLayerPickerCartLineFromSelectedSeat(seat));
  }
  return Object.freeze({
    lines: missing.length === 0
      ? reported
      : Object.freeze([...reported, ...missing]),
    completed: missing.length > 0,
  });
}

/** The tickets a completed cart holds, counted from its own lines. */
export function seatLayerPickerCartLineQuantity(
  lines: readonly SeatLayerPickerCartLine[],
): number {
  return lines.reduce(
    (total, line) => total + (Number.isFinite(line.quantity) ? line.quantity : 1),
    0,
  );
}
