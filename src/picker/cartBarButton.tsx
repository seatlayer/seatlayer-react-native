import React, { createContext, useContext, useLayoutEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerBold } from './boldText';
import {
  seatLayerCartBarLetters, seatLayerCartBarPlan, seatLayerCartBarSize as bar,
} from './cartBarRule';
import { useSeatLayerCartBarRuler } from './cartBarWidths';
import type { SeatLayerCheckoutCtaState } from './checkoutCta';
import { blendSeatLayerPickerColor } from './colors';
import { seatLayerPickerLineWidth } from './lineWidth';
import type { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';

/** The row a checkout button stands in. */
export interface SeatLayerCartBarRow {
  /** How wide the row is, its padding included. */
  readonly width: number;
  /** The room the button leaves for the words. */
  readonly onWordsWidth: (width: number) => void;
}

const CartBarContext = createContext<SeatLayerCartBarRow | undefined>(undefined);
export const SeatLayerCartBarProvider = CartBarContext.Provider;
export function useSeatLayerCartBarRow(): SeatLayerCartBarRow | undefined {
  return useContext(CartBarContext);
}

/** The words that stay on the button, in the app's own wording. */
export function useSeatLayerCartBarOwnWords(): readonly string[] {
  const { strings } = useSeatLayerPickerScope();
  return [
    strings.translate('findBestSeatsCta'),
    strings.translate('holdAndCheckout'),
    strings.translate('continueToCheckout'),
  ];
}

type Theme = ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;

function textStyle(theme: Theme, letters: number, slot: StyleProp<TextStyle>): TextStyle {
  const size = seatLayerCartBarLetters[letters] ?? bar.buttonFont;
  return StyleSheet.flatten([{
    fontFamily: theme.fontFamily,
    fontSize: size,
    fontWeight: seatLayerPickerBold(800),
    lineHeight: size * bar.buttonLine,
    textAlign: 'center',
  }, slot]) as TextStyle;
}

/** Whether the button goes under the words in a row of `width`. */
export function useSeatLayerCartBarUnder(
  width: number, theme: Theme, slot: StyleProp<TextStyle>,
): Readonly<{ under: boolean; box: React.ReactElement | null }> {
  const style = textStyle(theme, 0, slot);
  const own = useSeatLayerCartBarOwnWords();
  const ruler = useSeatLayerCartBarRuler([], own.map((text) => ({ text, style })));
  return {
    under: seatLayerCartBarPlan({
      width, own: own.map((text) => ruler.label(text, style)), label: [], labelIsOwn: true,
    }).under,
    box: ruler.box,
  };
}

/** The checkout button as the phone's cart row draws it. */
export function SeatLayerCartBarButton(props: Readonly<{
  cta: SeatLayerCheckoutCtaState;
  onPress: (() => void) | undefined;
  paint: StyleProp<ViewStyle>;
  textSlot: StyleProp<TextStyle>;
  theme: Theme;
  row: SeatLayerCartBarRow;
}>): React.ReactElement {
  const { cta, theme } = props;
  const disabled = !cta.enabled;
  const own = useSeatLayerCartBarOwnWords();
  const labelIsOwn = own.includes(cta.label);
  const styles = seatLayerCartBarLetters.map((_, letters) => textStyle(theme, letters, props.textSlot));
  const sizes = labelIsOwn ? styles.slice(0, 1) : styles;
  const ruler = useSeatLayerCartBarRuler([], [
    ...own.map((text) => ({ text, style: styles[0]! })),
    ...sizes.map((style) => ({ text: cta.label, style })),
  ]);
  const plan = seatLayerCartBarPlan({
    width: props.row.width,
    own: own.map((text) => ruler.label(text, styles[0]!)),
    label: sizes.map((style) => ruler.label(cta.label, style)),
    labelIsOwn,
  });
  const { onWordsWidth } = props.row;
  useLayoutEffect(() => { onWordsWidth(plan.wordsWidth); }, [onWordsWidth, plan.wordsWidth]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cta.label}
      accessibilityState={{ busy: cta.busy, disabled }}
      disabled={disabled}
      onPress={props.onPress}
      testID="seatlayer-cart-checkout"
      style={{ width: plan.buttonWidth }}
    >
      {ruler.box}
      <View style={[{
        alignItems: 'center',
        backgroundColor: disabled
          ? blendSeatLayerPickerColor(theme.colors.background, theme.colors.surface, .35, theme.colors.surface)
          : theme.colors.accent,
        borderColor: disabled ? theme.colors.divider : 'transparent',
        borderRadius: bar.buttonRadius,
        borderWidth: disabled ? seatLayerPickerLineWidth : 0,
        justifyContent: 'center',
        minHeight: bar.minHeight,
        paddingVertical: bar.buttonPadY - (disabled ? seatLayerPickerLineWidth : 0),
      }, props.paint]}>
        <Text
          maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
          textBreakStrategy="simple"
          style={[styles[plan.letters], {
            color: disabled ? theme.colors.mutedText : theme.colors.onAccent,
            maxWidth: plan.textWidth,
          }, props.textSlot]}
        >{cta.label}</Text>
      </View>
    </Pressable>
  );
}
