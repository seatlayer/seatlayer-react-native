import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { seatLayerPickerClampedFontScale, seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerCartBarParts, type SeatLayerCartBarWidths } from './cartBarRule';

/**
 * How wide the cart row's words are.
 *
 * React Native measures text only where it draws it, so each word is drawn once
 * in a box nobody sees, and never again while its letters stay the same.
 */
const known = new Map<string, number>();
const mostKnown = 600;

export interface SeatLayerCartBarText {
  readonly text: string;
  readonly style: TextStyle;
}

function keyOf(text: string, style: TextStyle, scale: number): string {
  return [scale, style.fontFamily ?? '', style.fontWeight ?? '', style.fontSize ?? '',
    style.letterSpacing ?? '', text].join('|');
}

/** Near enough to stand in until the real width is known. */
function guess(text: string, style: TextStyle, scale: number): number {
  return [...text].length * (style.fontSize ?? 14) * .56 * scale;
}

export interface SeatLayerCartBarRuler {
  readonly width: (text: string, style: TextStyle) => number;
  readonly label: (text: string, style: TextStyle) => SeatLayerCartBarWidths;
  /** The box that measures what is not known yet; null when all of it is. */
  readonly box: React.ReactElement | null;
}

/** Measures `texts` whole, and `labels` whole and word by word. */
export function useSeatLayerCartBarRuler(
  texts: readonly SeatLayerCartBarText[],
  labels: readonly SeatLayerCartBarText[],
): SeatLayerCartBarRuler {
  const [, measured] = useState(0);
  const clamp = seatLayerPickerTypeScaleClamp('sheet');
  const scale = seatLayerPickerClampedFontScale(clamp);
  const missing = new Map<string, SeatLayerCartBarText>();
  const want = ({ text, style }: SeatLayerCartBarText) => {
    const key = keyOf(text, style, scale);
    if (text.length > 0 && !known.has(key)) missing.set(key, { text, style });
  };
  texts.forEach(want);
  for (const label of labels) {
    want(label);
    for (const part of seatLayerCartBarParts(label.text)) want({ text: part, style: label.style });
  }
  const learn = useCallback((key: string, width: number) => {
    if (!Number.isFinite(width) || width <= 0 || known.get(key) === width) return;
    if (known.size >= mostKnown) known.clear();
    known.set(key, width);
    measured((count) => count + 1);
  }, []);
  const widthOf = (text: string, style: TextStyle) => text.length === 0
    ? 0 : known.get(keyOf(text, style, scale)) ?? guess(text, style, scale);
  return {
    width: widthOf,
    label: (text: string, style: TextStyle) => ({
      whole: widthOf(text, style),
      parts: seatLayerCartBarParts(text).map((part) => widthOf(part, style)),
    }),
    box: missing.size === 0 ? null : (
      <View
        accessible={false}
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.hidden}
      >
        <View style={styles.sheet}>
          {[...missing].map(([key, { text, style }]) => (
            <Text
              key={key}
              maxFontSizeMultiplier={clamp}
              numberOfLines={1}
              onLayout={(event) => learn(key, event.nativeEvent.layout.width)}
              style={style}
            >{text}</Text>
          ))}
        </View>
      </View>
    ),
  };
}

const styles = StyleSheet.create({
  hidden: { height: 0, left: 0, opacity: 0, overflow: 'hidden', position: 'absolute', top: 0, width: 0 },
  sheet: { alignItems: 'flex-start', width: 2_000 },
});
