import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { SeatLayerCartCellCrossFade } from './cartRowMotion';
import { useSeatLayerCartLanding } from './cartLanding';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { projectSeatLayerCartSheet, seatLayerCartSeatsLine } from './cartSheetUi';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { resolveSeatLayerPickerMotion } from './motion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerBold } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';
import type { SeatLayerPickerStyles } from './styles';

/**
 * The foot: what the cart comes to, the way on, and the by-line (spec §3.10.3).
 *
 * THE SAME BLOCK ON EVERY WIDTH, and the one the collapsed sheet shows. It is
 * not restyled on a phone at all — one set of tokens is one thing to get right,
 * and the only difference the phone has left is the WORD on the button, which
 * `seatLayerCheckoutCtaState` decides.
 */
export interface SeatLayerSheetFootProps {
  /**
   * Whether a card list sits above the foot and wants a rule under it. The
   * collapsed sheet has nothing above the foot but the panel's own top edge,
   * and a second hairline a few points under the first reads as two lines for
   * one edge.
   */
  readonly divider: boolean;
  readonly holdLapse?: ReactNode;
  readonly actionError?: ReactNode;
  readonly checkoutBar?: ReactNode;
  readonly attribution?: ReactNode;
  /** Opens the cards; null while there is nothing folded away to open. */
  readonly onOpenCart?: (() => void) | undefined;
  readonly collapsed: boolean;
  readonly landing?: boolean;
  readonly totalStyle?: SeatLayerPickerStyles['peekSummaryText'];
}

export function SeatLayerSheetFoot(props: SeatLayerSheetFootProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  return (
    <View
      testID="seatlayer-cart-foot"
      style={{
        borderTopColor: theme.colors.divider,
        borderTopWidth: props.divider ? seatLayerPickerLineWidth : 0,
        paddingBottom: seatLayerPickerTokens.size.footPadBottom,
        paddingHorizontal: seatLayerPickerTokens.size.footPadX,
        paddingTop: seatLayerPickerTokens.size.footPadTop,
      }}
    >
      {/* News about the buyer's own seats outranks the layout: a toast is gone
          in four seconds, and the offer to take lapsed seats back has to
          outlive it. */}
      {props.holdLapse}
      {props.actionError}
      <SeatLayerCartTotalLine
        collapsed={props.collapsed}
        landing={props.landing}
        onOpenCart={props.onOpenCart}
        style={props.totalStyle}
      />
      <View style={{ height: seatLayerPickerTokens.size.footTotalGap }} />
      {props.checkoutBar}
      {/* Centred, not trailing: at the foot of a phone the trailing edge is the
          display's rounded corner, and a credit tucked into it lost its last
          letters behind the glass. */}
      {props.attribution === undefined || props.attribution === null
        ? null
        : (
          <View
            testID="seatlayer-cart-attribution-foot"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: seatLayerPickerTokens.size.attributionHeight,
            }}
          >{props.attribution}</View>
        )}
    </View>
  );
}

export interface SeatLayerCartTotalLineProps {
  readonly collapsed: boolean;
  readonly landing?: boolean;
  readonly onOpenCart?: (() => void) | undefined;
  readonly style?: SeatLayerPickerStyles['peekSummaryText'];
}

/**
 * What is in the cart, and what it comes to.
 *
 * `strings.noSeatsSelected` on an empty cart, `strings.ticketCount` and the
 * total once there is one. THERE IS NO `From €25` HERE ANY MORE: it stated a
 * price and offered nothing to do about it, on the one line the buyer reads to
 * find out what they are about to pay.
 */
export function SeatLayerCartTotalLine(
  props: SeatLayerCartTotalLineProps,
): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const contextLanding = useSeatLayerCartLanding();
  const landing = props.landing ?? contextLanding;
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const swell = useRef(new Animated.Value(0)).current;
  const last = useRef<string | undefined>(undefined);
  const pending = useRef(false);
  const projection = useMemo(
    () => projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat),
    [scope.pendingSeat, scope.snapshot],
  );
  // What the buyer has AGREED to. A tapped seat is in the runtime's selection
  // from the moment it is tapped, but a confirm card standing over the map is
  // still asking whether they want it.
  const count = projection.totals.quantity;
  const summary = count === 0
    ? scope.strings.translate('noSeatsSelected')
    : scope.strings.translate('ticketCount', { count, values: { count } });
  const total = count === 0 || projection.totals.currency === null
    ? ''
    : scope.formatMoney(projection.totals.total, projection.totals.currency);
  // Noted during render, not through state: a swell that scheduled two extra
  // renders of the whole foot on every cart change paid for one beat of
  // movement with the frame the movement is supposed to land in.
  if (last.current !== summary) {
    const first = last.current === undefined;
    last.current = summary;
    if (!first && !reducedMotion) pending.current = true;
  }
  useEffect(() => {
    // The swell fires on the chip's LANDING, not on the press: while a chip is
    // still flying the number holds still.
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
  }, [landing, reducedMotion, summary, swell]);

  // Which seats, in one muted line under the count, while the cards are folded
  // away: "2 tickets" alone told the buyer they had bought something and not
  // what, and the handle above was the only way to find out.
  const seats = props.collapsed && count > 0
    ? seatLayerCartSeatsLine(projection.confirmed.items)
    : '';
  const opens = props.collapsed && count > 0 && props.onOpenCart !== undefined;
  const line = (
    <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
      <Swelled anchor="flex-start" swell={swell}>
        {
          <SeatLayerCartCellCrossFade token={summary}>
            <Animated.Text
              accessible={false}
              maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[{
                color: blinked(swell, theme.colors.text, theme.colors.accent),
                fontFamily: theme.fontFamily,
                fontSize: seatLayerPickerTokens.type.footTotalLabel.size,
                fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.footTotalLabel.weight),
              }, props.style]}
            >{summary}</Animated.Text>
          </SeatLayerCartCellCrossFade>
        }
      </Swelled>
      {total
        ? (
          <Swelled anchor="flex-end" swell={swell}>
            {
              <SeatLayerCartCellCrossFade token={total}>
                <Animated.Text
                  accessible={false}
                  maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
                  numberOfLines={1}
                  testID="seatlayer-cart-foot-total"
                  style={{
                    color: blinked(swell, theme.colors.text, theme.colors.accent),
                    fontFamily: theme.fontFamily,
                    fontSize: seatLayerPickerTokens.type.footTotalAmount.size,
                    fontVariant: ['tabular-nums'],
                    fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.footTotalAmount.weight),
                  }}
                >{total}</Animated.Text>
              </SeatLayerCartCellCrossFade>
            }
          </Swelled>
        )
        : null}
    </View>
  );
  return (
    <Pressable
      accessible
      // The one line that says what the cart holds. It is announced on change
      // rather than on a timer: the sentence changes when the cart does.
      accessibilityLiveRegion="polite"
      accessibilityRole={opens ? 'button' : 'text'}
      accessibilityLabel={total ? `${summary}, ${total}` : summary}
      disabled={!opens}
      onPress={opens ? props.onOpenCart : undefined}
      testID="seatlayer-cart-total-line"
    >
      {line}
      {seats
        ? (
          <View accessible={false} style={{ alignItems: 'center', flexDirection: 'row', marginTop: 3 }}>
            <Text
              maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID="seatlayer-cart-seats-line"
              style={{
                color: theme.colors.mutedText,
                flex: 1,
                fontFamily: theme.fontFamily,
                fontSize: 12,
                fontWeight: seatLayerPickerBold(600),
              }}
            >{seats}</Text>
            {/* Not the handle's chevron: the handle stays the cart's one named
                toggle, and this is only a hint that the line opens. */}
            <UnfoldHint color={theme.colors.mutedText} />
          </View>
        )
        : null}
    </Pressable>
  );
}

/**
 * The one beat of movement a changed count earns: 1.3× at the peak with the ink
 * blinking to the accent, anchored on its own edge so the words grow out of the
 * line rather than sliding across it.
 */
function Swelled({ anchor, children, swell }: Readonly<{
  anchor: 'flex-start' | 'flex-end';
  children: ReactNode;
  swell: Animated.Value;
}>): React.ReactElement {
  return (
    <Animated.View
      style={{
        alignItems: anchor,
        flexShrink: 1,
        transform: [
          // Out to the full swell at forty-five per cent, and back.
          { scale: swell.interpolate({ inputRange: [0, .45, 1], outputRange: [1, 1.3, 1] }) },
        ],
      }}
    >{children}</Animated.View>
  );
}

/** The ink, blinking to the accent at the peak of the swell and back. */
function blinked(swell: Animated.Value, text: string, accent: string): string {
  return swell.interpolate({
    inputRange: [0, .45, 1],
    outputRange: [text, accent, text],
  }) as unknown as string;
}

/** Two stacked chevrons: the line has more behind it. */
function UnfoldHint({ color }: Readonly<{ color: string }>): React.ReactElement {
  return (
    <View accessible={false} style={{ alignItems: 'center', height: 16, justifyContent: 'center', marginStart: 6, width: 16 }}>
      <View style={{
        borderBottomColor: color, borderBottomWidth: 1.6, borderRightColor: color,
        borderRightWidth: 1.6, height: 4.5, marginBottom: 1.5,
        transform: [{ rotate: '225deg' }], width: 4.5,
      }} />
      <View style={{
        borderBottomColor: color, borderBottomWidth: 1.6, borderRightColor: color,
        borderRightWidth: 1.6, height: 4.5, transform: [{ rotate: '45deg' }], width: 4.5,
      }} />
    </View>
  );
}
