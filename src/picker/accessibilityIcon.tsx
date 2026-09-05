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
  const ring = (d: number, stroke: number, x: number, y: number) => ({
    borderColor: color,
    borderRadius: (d / 2) * u,
    borderWidth: stroke * u,
    height: d * u,
    left: x * u,
    position: 'absolute' as const,
    top: y * u,
    width: d * u,
  });
  const head = (d: number, x: number, y: number) => ({
    backgroundColor: color,
    borderRadius: (d / 2) * u,
    height: d * u,
    left: x * u,
    position: 'absolute' as const,
    top: y * u,
    width: d * u,
  });
  return (
    <View accessible={false} style={{ height: size, width: size }}>
      {variant === 'iso'
        ? (
          <>
            {/* Upright: head over shoulders, a straight back into the wheel. */}
            <View style={ring(14, 1.9, 4.6, 8.4)} />
            <View style={head(4.2, 9.6, 1.2)} />
            <View style={bar(7.4, 1.9, 8.1, 6.4)} />
            <View style={bar(1.9, 5.6, 10.9, 6.4)} />
            <View style={bar(4.6, 1.9, 10.9, 11.3)} />
          </>
        )
        : (
          <>
            {/* Leaning forward, and measured off the reference frame rather
                than sketched: the wheel is BEHIND and LEFT of the figure, the
                head is carried out over it, the arm reaches back across the
                rim, and one leg runs down the front. Every number below is the
                reference's own ink at 390×844 @3x, divided back onto the
                24-unit grid the glyph is authored on. */}
            <View style={ring(8.9, 2.0, 4.6, 11.6)} />
            <View style={head(4.3, 16.1, 1.4)} />
            {/* Shoulders and the arm reaching back over the rim. */}
            <View style={bar(9.2, 2.8, 8.4, 6.0)} />
            {/* The back, leaning out over the wheel as it falls. */}
            <View style={bar(5.2, 8.6, 12.0, 5.4, '11deg')} />
            {/* The seat, and the leg down its leading edge. */}
            <View style={bar(9.2, 2.0, 11.2, 12.8)} />
            <View style={bar(1.6, 4.8, 18.4, 15.2)} />
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
