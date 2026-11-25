import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, I18nManager, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerBold } from './boldText';
import { seatLayerCartBarSize as bar, seatLayerCartBarTotal } from './cartBarRule';
import { useSeatLayerCartBarRuler } from './cartBarWidths';
import { useSeatLayerCartLanding } from './cartLanding';
import { SeatLayerCartCellCrossFade } from './cartRowMotion';
import { seatLayerCartSeatsLine } from './cartSeatsLine';
import { projectSeatLayerCartSheet } from './cartSheetUi';
import type { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { resolveSeatLayerPickerMotion } from './motion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { seatLayerPickerEventDateLine } from './SeatLayerPickerAccessPanel';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import type { SeatLayerPickerStyles } from './styles';

type Theme = ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;

export interface SeatLayerCartBarSummary {
  /** The sale is over and no seat is held: the row says so, and has no button. */
  readonly closed: boolean;
  readonly count: number;
  /** "2 tickets", "No seats selected" or "Sales are closed". */
  readonly first: string;
  readonly total: string;
  /** The seats' names, or a closed event's date. */
  readonly second: string;
  readonly spoken: string;
}

/**
 * What the row says. It counts what the buyer has AGREED to: a tapped seat is
 * in the runtime's selection from the moment it is tapped, but a card standing
 * over the map is still asking whether they want it.
 */
export function useSeatLayerCartBarSummary(): SeatLayerCartBarSummary {
  const scope = useSeatLayerPickerScope();
  const { snapshot } = scope;
  const projection = useMemo(
    () => projectSeatLayerCartSheet(snapshot, scope.pendingSeat),
    [scope.pendingSeat, snapshot],
  );
  const closed = snapshot?.event.salesClosed === true && snapshot.hold.active !== true;
  const count = projection.totals.quantity;
  const currency = projection.totals.currency;
  const total = closed || count === 0 || currency === null
    ? '' : scope.formatMoney(projection.totals.total, currency);
  const first = closed
    ? scope.strings.translate('salesClosed')
    : count === 0
      ? scope.strings.translate('noSeatsSelected')
      : scope.strings.translate('ticketCount', { count, values: { count } });
  const second = closed
    ? snapshot.event.startsAtLabel ?? seatLayerPickerEventDateLine(snapshot, scope.strings.locale) ?? ''
    : count === 0 ? '' : seatLayerCartSeatsLine(projection.confirmed.items);
  return {
    closed, count, first, total, second,
    spoken: [first, closed ? second : total].filter(Boolean).join(', '),
  };
}

/** Each line at the row's own start, in either reading direction. */
const atStart = { alignSelf: 'flex-start', maxWidth: '100%' } as const;

export function SeatLayerCartBarWords({ landing: landingProp, room, style, summary, theme }: Readonly<{
  landing: boolean | undefined;
  /** The width the words have. */
  room: number;
  style: SeatLayerPickerStyles['peekSummaryText'];
  summary: SeatLayerCartBarSummary;
  theme: Theme;
}>): React.ReactElement {
  const clamp = seatLayerPickerTypeScaleClamp('sheet');
  const letters = (size: number, weight: number, color: string): TextStyle => ({
    color, fontFamily: theme.fontFamily, fontSize: size, fontWeight: seatLayerPickerBold(weight),
    lineHeight: bar.wordsLine,
  });
  const countStyle = StyleSheet.flatten([letters(bar.countFont, 600, theme.colors.text), style]) as TextStyle;
  const totalStyle = letters(bar.totalFont, 800, theme.colors.text);
  const ruler = useSeatLayerCartBarRuler(summary.total
    ? [{ text: summary.first, style: countStyle }, { text: summary.total, style: totalStyle }]
    : [], []);
  const total = seatLayerCartBarTotal(
    ruler.width(summary.first, countStyle), ruler.width(summary.total, totalStyle),
    room,
  );
  const swell = useSwell(summary.first, landingProp);
  // The count and the total grow out of the line's own start, and never past
  // the words' own room.
  const line = ruler.width(summary.first, countStyle) + bar.totalGap + ruler.width(summary.total, totalStyle);
  const peak = line > 0 ? Math.max(1, Math.min(1.3, room / line)) : 1.3;
  const shift = (peak - 1) * line / 2 * (I18nManager.isRTL ? -1 : 1);
  const beat = (rest: number, most: number) => swell.interpolate({ inputRange: [0, .45, 1], outputRange: [rest, most, rest] });
  const grown = { transform: [{ translateX: beat(0, shift) }, { scale: beat(1, peak) }] };
  const ink = swell.interpolate({
    inputRange: [0, .45, 1],
    outputRange: [theme.colors.text, theme.colors.accent, theme.colors.text],
  }) as unknown as string;
  const first = (
    <SeatLayerCartCellCrossFade style={total.beside && summary.total !== '' ? undefined : atStart} token={summary.first}>
      <Animated.Text
        accessible={false}
        ellipsizeMode="tail"
        maxFontSizeMultiplier={clamp}
        numberOfLines={summary.count === 0 && !summary.closed ? 2 : 1}
        style={[countStyle, { color: ink }, style]}
        testID="seatlayer-cart-count"
      >{summary.first}</Animated.Text>
    </SeatLayerCartCellCrossFade>
  );
  const amount = summary.total === '' ? null : (
    <SeatLayerCartCellCrossFade token={summary.total}>
      <Animated.Text
        accessible={false}
        maxFontSizeMultiplier={clamp}
        numberOfLines={1}
        style={[totalStyle, { color: ink, fontSize: bar.totalFont * total.scale }]}
        testID="seatlayer-cart-foot-total"
      >{summary.total}</Animated.Text>
    </SeatLayerCartCellCrossFade>
  );
  const second = summary.second === '' ? null : (
    <Text
      accessible={false}
      ellipsizeMode="tail"
      maxFontSizeMultiplier={clamp}
      numberOfLines={1}
      style={[letters(bar.namesFont, 400, theme.colors.mutedText), atStart, { marginTop: 1 }]}
      testID="seatlayer-cart-seats-line"
    >{summary.second}</Text>
  );
  return (
    <View>
      {ruler.box}
      {amount === null
        ? first
        : total.beside
          ? (
            <Animated.View style={[{ alignItems: 'baseline', alignSelf: 'flex-start', flexDirection: 'row', gap: bar.totalGap }, grown]}>
              {first}
              {amount}
            </Animated.View>
          )
          : <>{first}<View style={{ alignItems: 'flex-start', marginTop: 1 }}>{amount}</View></>}
      {amount === null || total.beside ? second : null}
    </View>
  );
}

/**
 * The one beat of movement a changed count earns. It fires on the chip's
 * LANDING, not on the press: while a chip is still flying the number holds
 * still.
 */
function useSwell(words: string, landingProp: boolean | undefined): Animated.Value {
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const contextLanding = useSeatLayerCartLanding();
  const landing = landingProp ?? contextLanding;
  const swell = useRef(new Animated.Value(0)).current;
  const last = useRef<string | undefined>(undefined);
  const pending = useRef(false);
  // Noted during render, not through state: a swell that scheduled two extra
  // renders of the foot on every cart change paid for one beat of movement with
  // the frame the movement is supposed to land in.
  if (last.current !== words) {
    const first = last.current === undefined;
    last.current = words;
    if (!first && !reducedMotion) pending.current = true;
  }
  useEffect(() => {
    if (!pending.current || landing) return undefined;
    pending.current = false;
    const motion = resolveSeatLayerPickerMotion('bump', reducedMotion, 'easeEnter');
    swell.stopAnimation();
    swell.setValue(0);
    if (motion.durationMs === 0) return undefined;
    const [x1, y1, x2, y2] = motion.curve.cubicBezier;
    const animation = Animated.timing(swell, {
      duration: motion.durationMs,
      easing: Easing.bezier(x1, y1, x2, y2),
      toValue: 1,
      // The blink interpolates a colour, which the native driver cannot carry.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [landing, reducedMotion, swell, words]);
  return swell;
}
