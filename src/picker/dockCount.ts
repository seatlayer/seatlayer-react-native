import {
  seatLayerPickerSectionAccessibleFree,
  seatLayerSectionAccessCountsCapability,
} from './accessibilityFocus';
import { seatLayerPickerPluralKey } from './buyerStates';
import type { SeatLayerPickerSectionSummary, SeatLayerPickerSnapshot } from './models';

export type SeatLayerDockCountRung = 'long' | 'short' | 'hidden';

export interface SeatLayerDockCountCopy {
  /** `strings.seatsLeftInSectionOne` / `…Other` — the full sentence. */
  readonly long: string;
  /** `strings.seatsLeft` — the short rung. */
  readonly short: string;
  /**
   * ` · ♿ N`, appended to BOTH rungs so it is measured with the count rather
   * than discovered after layout. Absent where nothing counted this section:
   * a bar that drew `♿ 0` would tell a buyer the section is full when the
   * truth is that nobody counted it.
   */
  readonly accessSuffix?: string;
  /** The full sentence plus the suffix, whatever the visible ladder chose. */
  readonly accessibleName: string;
}

export const seatLayerDockAccessGlyph = '♿';

/**
 * §3.6. The dock's count and its matching-spaces suffix, as strings, so the
 * fit ladder measures exactly what it will draw.
 */
export function seatLayerDockCountCopy(input: Readonly<{
  sectionName: string;
  seatsLeft: number | undefined;
  section: SeatLayerPickerSectionSummary | undefined;
  snapshot: SeatLayerPickerSnapshot | undefined;
  translate: (key: string, options?: { count?: number; values?: Record<string, string | number> }) => string;
  locale?: string | null;
}>): SeatLayerDockCountCopy {
  const { seatsLeft, translate } = input;
  const filter = input.snapshot?.map.accessibilityFilter ?? [];
  const countsReported = input.snapshot?.capabilities
    .includes(seatLayerSectionAccessCountsCapability) === true;
  const matching = filter.length > 0
    ? seatLayerPickerSectionAccessibleFree(input.section, filter, countsReported)
    : undefined;
  const accessSuffix = matching === undefined
    ? undefined
    : ` · ${seatLayerDockAccessGlyph} ${matching}`;
  const long = seatsLeft === undefined
    ? ''
    : translate(
      seatLayerPickerPluralKey('seatsLeftInSection', seatsLeft, input.locale),
      { count: seatsLeft, values: { count: seatsLeft } },
    );
  const short = seatsLeft === undefined
    ? ''
    : translate('seatsLeft', { count: seatsLeft, values: { count: seatsLeft } });
  return Object.freeze({
    long: long ? `${long}${accessSuffix ?? ''}` : '',
    short: short ? `${short}${accessSuffix ?? ''}` : '',
    ...(accessSuffix === undefined ? {} : { accessSuffix }),
    accessibleName: [input.sectionName, long ? `${long}${accessSuffix ?? ''}` : accessSuffix?.trim()]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' · '),
  });
}
