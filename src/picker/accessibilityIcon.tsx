import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * The accessibility marks, DRAWN rather than typed.
 *
 * `U+267F` is an emoji-presentation codepoint: the platform paints it as a
 * white figure on a blue rounded square, in its own colours, at its own cap
 * height — the same trap the held line's padlock fell into. So both marks are
 * built out of Views, on the reference's 24-unit grid, and take the ink they
 * are handed.
 *
 * Two marks, because the reference draws two (`picker_accessibility.dart`):
 *  - `iso` — the upright seated figure, on the sheet's rows and on the section
 *    stepper (Flutter `Icons.accessible_rounded`);
 *  - `forward` — the leaning figure reaching for the rim, on the map's own
 *    disc alone (Flutter `Icons.accessible_forward_rounded`).
 * A port that draws one mark in both places is wrong in one of them.
 */
export type SeatLayerPickerAccessIconVariant = 'iso' | 'forward';

/** The grid the reference's glyphs are authored on; every number below is on it. */
const grid = 24;

export function SeatLayerPickerAccessIcon({ color, size = 21, variant = 'iso' }: Readonly<{
  color: string;
  size?: number;
  variant?: SeatLayerPickerAccessIconVariant;
}>): React.ReactElement {
  const u = size / grid;
  // The wheel is the half of the mark both variants share.
  const wheel = {
    borderColor: color,
    borderRadius: 7 * u,
    borderWidth: 1.9 * u,
    height: 14 * u,
    left: 4.6 * u,
    position: 'absolute' as const,
    top: 8.4 * u,
    width: 14 * u,
  };
  const head = {
    backgroundColor: color,
    borderRadius: 2.1 * u,
    height: 4.2 * u,
    position: 'absolute' as const,
    width: 4.2 * u,
  };
  const bar = (w: number, h: number, x: number, y: number, rotate?: string) => ({
    backgroundColor: color,
    borderRadius: (Math.min(w, h) / 2) * u,
    height: h * u,
    left: x * u,
    position: 'absolute' as const,
    top: y * u,
    transform: rotate ? [{ rotate }] : undefined,
    width: w * u,
  });
  return (
    <View accessible={false} style={{ height: size, width: size }}>
      <View style={wheel} />
      {variant === 'iso'
        ? (
          <>
            {/* Upright: head over shoulders, a straight back into the wheel. */}
            <View style={[head, { left: 9.6 * u, top: 1.2 * u }]} />
            <View style={bar(7.4, 1.9, 8.1, 6.4)} />
            <View style={bar(1.9, 5.6, 10.9, 6.4)} />
            <View style={bar(4.6, 1.9, 10.9, 11.3)} />
          </>
        )
        : (
          <>
            {/* Leaning: the head is carried forward of the wheel and the arm
                reaches down and back to the rim — the active figure. */}
            <View style={[head, { left: 12.4 * u, top: 0.9 * u }]} />
            <View style={bar(1.9, 7.4, 11.4, 5.2, '22deg')} />
            <View style={bar(1.9, 6.2, 8.2, 7.4, '-38deg')} />
            <View style={bar(4.8, 1.9, 11.2, 11.9, '14deg')} />
          </>
        )}
    </View>
  );
}

/**
 * The colour mark of the sheet's two view rows — a circle split down the
 * middle, one half inked (Flutter `Icons.contrast_rounded`). It says "the same
 * picture, told in other colours", which a palette of swatches does not.
 */
export function SeatLayerPickerContrastIcon({ color, size = 16 }: Readonly<{
  color: string;
  size?: number;
}>): React.ReactElement {
  return (
    <View
      accessible={false}
      style={[icons.contrast, {
        borderColor: color,
        borderRadius: size / 2,
        borderWidth: size / 12.8,
        height: size,
        width: size,
      }]}
    >
      <View style={{ backgroundColor: color, height: size, width: size / 2 }} />
    </View>
  );
}

const icons = StyleSheet.create({
  contrast: { overflow: 'hidden' },
});
