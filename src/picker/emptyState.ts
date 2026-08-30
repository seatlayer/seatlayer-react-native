import type { SeatLayerPickerSnapshot } from './models';

function knownAvailability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Returns true only when the runtime provides positive empty-inventory proof.
 * Missing category/GA availability stays unknown so the ready-made picker does
 * not cover a usable map with a false sold-out message.
 */
export function isSeatLayerPickerSnapshotEmpty(
  snapshot: SeatLayerPickerSnapshot | undefined,
): boolean {
  if (!snapshot || !Array.isArray(snapshot.selection) || !Array.isArray(snapshot.cartLines) ||
    !Array.isArray(snapshot.categories) || !Array.isArray(snapshot.generalAdmissionAreas) ||
    snapshot.selection.length > 0 || snapshot.cartLines.length > 0) return false;
  const categoryEvidence = snapshot.categories.length > 0 &&
    snapshot.categories.every((category) => knownAvailability(category.available));
  const gaEvidence = snapshot.generalAdmissionAreas.length > 0 &&
    snapshot.generalAdmissionAreas.every((area) => knownAvailability(area.available));
  if (!categoryEvidence && !gaEvidence) return false;
  if (snapshot.categories.some((category) => !category.notForSale && category.available > 0)) return false;
  if (snapshot.generalAdmissionAreas.some((area) =>
    !knownAvailability(area.available) || area.available > 0,
  )) return false;
  return true;
}
