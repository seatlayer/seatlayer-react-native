import type { SeatLayerPickerCategory, SeatLayerPickerSnapshot } from './models';

export const seatLayerCategoryAvailabilityCapability = 'category-availability-v1';

function knownAvailability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * A seated category's live free count. Where the runtime advertises
 * `category-availability-v1`, `free` is the only honest source: `available`
 * reports 0 for a count that has not landed, so reading it would call a
 * half-loaded chart sold out. Without the capability `available` is all there
 * is, and the caller still needs positive evidence for every category.
 */
export function seatLayerPickerCategoryFree(
  category: SeatLayerPickerCategory,
  reportsFreeCounts: boolean,
): number | undefined {
  const value = reportsFreeCounts ? category.free : category.available;
  return knownAvailability(value) ? value : undefined;
}

function reportsFreeCounts(snapshot: SeatLayerPickerSnapshot): boolean {
  return Array.isArray(snapshot.capabilities) &&
    snapshot.capabilities.includes(seatLayerCategoryAvailabilityCapability);
}

function seatedCategories(
  snapshot: SeatLayerPickerSnapshot,
): readonly SeatLayerPickerCategory[] {
  return snapshot.categories.filter((category) => category.notForSale !== true);
}

/**
 * §3.13.5. Every seated category's live free count is zero, there is at least
 * one seated category, and the chart has no general-admission areas. It clears
 * live, and it is informational only — there is no waitlist.
 *
 * A count that has not been reported is NOT zero: an unknown category leaves
 * the predicate false, so a usable map is never covered by a false sold-out.
 */
export function isSeatLayerPickerSoldOut(
  snapshot: SeatLayerPickerSnapshot | undefined,
): boolean {
  if (!snapshot || !Array.isArray(snapshot.categories) ||
    !Array.isArray(snapshot.generalAdmissionAreas)) return false;
  if (snapshot.generalAdmissionAreas.length > 0) return false;
  const seated = seatedCategories(snapshot);
  if (seated.length === 0) return false;
  const free = reportsFreeCounts(snapshot);
  return seated.every((category) => seatLayerPickerCategoryFree(category, free) === 0);
}

/**
 * Returns true only when the runtime provides positive empty-inventory proof.
 * Missing category/GA availability stays unknown so the ready-made picker does
 * not cover a usable map with a false sold-out message. It additionally
 * requires an empty selection and cart: a buyer holding seats is not looking
 * at a sold-out venue, whatever the remaining inventory says.
 */
export function isSeatLayerPickerSnapshotEmpty(
  snapshot: SeatLayerPickerSnapshot | undefined,
): boolean {
  if (!snapshot || !Array.isArray(snapshot.selection) || !Array.isArray(snapshot.cartLines) ||
    !Array.isArray(snapshot.categories) || !Array.isArray(snapshot.generalAdmissionAreas) ||
    snapshot.selection.length > 0 || snapshot.cartLines.length > 0) return false;
  const free = reportsFreeCounts(snapshot);
  const categoryEvidence = snapshot.categories.length > 0 &&
    snapshot.categories.every((category) =>
      seatLayerPickerCategoryFree(category, free) !== undefined);
  const gaEvidence = snapshot.generalAdmissionAreas.length > 0 &&
    snapshot.generalAdmissionAreas.every((area) => knownAvailability(area.available));
  if (!categoryEvidence && !gaEvidence) return false;
  if (snapshot.categories.some((category) =>
    category.notForSale !== true &&
    (seatLayerPickerCategoryFree(category, free) ?? 0) > 0)) return false;
  if (snapshot.generalAdmissionAreas.some((area) =>
    !knownAvailability(area.available) || area.available > 0,
  )) return false;
  return true;
}
