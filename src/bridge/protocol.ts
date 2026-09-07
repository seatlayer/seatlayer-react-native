import { asInteger, asObject } from '../json';
import type { ProtocolRange } from '../types';

/** The raw chart remains protocol 1; picker chrome uses the v2 profile. */
export const chartProtocolRange: ProtocolRange = { min: 1, max: 1 };
export const pickerProtocolRange: ProtocolRange = { min: 2, max: 2 };
export const nativeProtocolRange = chartProtocolRange;

export function decodeProtocolRange(value: unknown): ProtocolRange | undefined {
  const revision = asInteger(value);
  if (revision !== undefined) return { min: revision, max: revision };
  const object = asObject(value);
  const min = asInteger(object?.min);
  const max = asInteger(object?.max);
  return min !== undefined && max !== undefined && min <= max
    ? { min, max }
    : undefined;
}

export function negotiateProtocol(
  web: ProtocolRange,
  native: ProtocolRange = nativeProtocolRange,
): number {
  const agreed = Math.min(web.max, native.max);
  if (agreed < web.min || agreed < native.min) {
    throw new Error(
      `No shared SeatLayer protocol revision (native ${native.min}..${native.max}, web ${web.min}..${web.max}).`,
    );
  }
  return agreed;
}

/**
 * The native-chrome contract additions the hosted runtime advertises from
 * 0.80.3. Each capability announces additive, present-only snapshot fields; a
 * runtime that does not list one simply never reports them, which is a feature
 * this host does not offer rather than a failure.
 */
export const seatLayerSeatScreenPointCapability = 'seat-screen-point-v1';
export const seatLayerCategoryAvailabilityCapability = 'category-availability-v1';
export const seatLayerAccessibilityFocusCapability = 'accessibility-focus-v1';
export const seatLayerSectionAccessCountsCapability = 'section-access-counts-v1';
export const seatLayerSeatViewThumbnailCapability = 'seat-view-thumbnail-v1';

/**
 * Commands that change nothing a snapshot reports, so the contract gives them
 * no capability string: presence in the hello command table is the whole
 * contract. Never gate these on a capability.
 */
export const seatLayerSetSelectionFocusCommand = 'picker.setSelectionFocus';
export const seatLayerSetBlockedRegionsCommand = 'picker.setBlockedRegions';
export const seatLayerFrameSeatCommand = 'picker.frameSeat';

/** Camera commands announced by `accessibility-focus-v1`. */
export const seatLayerFocusAccessibilityFilterCommand = 'picker.focusAccessibilityFilter';
export const seatLayerFocusNextAccessibleSectionCommand = 'picker.focusNextAccessibleSection';

/** A seat already in the selection tapped again — the runtime's Remove ask. */
export const seatLayerSeatRetapEvent = 'seat.retap';
