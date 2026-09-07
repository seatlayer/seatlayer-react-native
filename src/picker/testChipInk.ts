import { blendSeatLayerPickerColor, parseSeatLayerPickerColor } from './colors';

/**
 * §3.4 "Ink — measured against the wash, not the surface." The test chip is not
 * painted on the surface; it is painted on the warning wash *over* it, which is
 * a different and always-warmer colour. A fixed blend measured against the bare
 * surface produced a 2.3:1 chip on a mixed theme (a light host theme over a
 * chart saved dark).
 */

/** WCAG AA for the chip's small label. */
export const seatLayerPickerTestChipContrastFloor = 4.5;
const walkStart = 0.15;
const walkStep = 0.05;
/** §3.4 step 3's two candidates, chosen by contrast when the hue cannot get there. */
const neutralInks = ['#172033', '#EEF1F8'] as const;

function channel(value: number): number {
  const part = value / 255;
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number | undefined {
  const rgb = parseSeatLayerPickerColor(color);
  if (rgb === undefined) return undefined;
  return 0.2126 * channel(rgb.red) + 0.7152 * channel(rgb.green) + 0.0722 * channel(rgb.blue);
}

export function seatLayerPickerContrastRatio(
  foreground: string,
  background: string,
): number {
  const front = luminance(foreground);
  const back = luminance(background);
  if (front === undefined || back === undefined) return 1;
  const [light, dark] = front >= back ? [front, back] : [back, front];
  return (light + 0.05) / (dark + 0.05);
}

/** The chip's actual ground: the warning colour at `opacity.warnPillWash` over the surface. */
export function seatLayerPickerTestChipWash(
  warning: string,
  surface: string,
  wash: number,
): string {
  return blendSeatLayerPickerColor(warning, surface, wash, surface);
}

/**
 * Resolved in three steps, in order of how much of the brand hue they keep, and
 * stopping at the FIRST candidate that clears the floor — the chip keeps as much
 * amber as the floor allows rather than driving to maximum contrast.
 *
 * 1. the warning hue itself, when it already clears 4.5:1 on its own wash;
 * 2. the hue walked toward the theme's text in 0.05 steps from 0.15;
 * 3. a neutral ink chosen by contrast, when the hue cannot get there at all —
 *    on a mid-tone ground no mix of a mid-tone gold and a mid-tone ink clears
 *    the floor, and a walk with no fallback returns the ground's own ink.
 */
export function seatLayerPickerTestChipInk(
  warning: string,
  text: string,
  wash: string,
): string {
  if (seatLayerPickerContrastRatio(warning, wash) >= seatLayerPickerTestChipContrastFloor) {
    return warning;
  }
  for (let mix = walkStart; mix <= 1 + 1e-9; mix += walkStep) {
    const candidate = blendSeatLayerPickerColor(text, warning, Math.min(1, mix), text);
    if (seatLayerPickerContrastRatio(candidate, wash) >= seatLayerPickerTestChipContrastFloor) {
      return candidate;
    }
  }
  const [dark, light] = neutralInks;
  return seatLayerPickerContrastRatio(dark, wash) >= seatLayerPickerContrastRatio(light, wash)
    ? dark
    : light;
}
