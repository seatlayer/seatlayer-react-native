import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type GestureResponderHandlers, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { splitSeatLayerFromPrice, type SeatLayerPeekLine } from './checkoutCta';

export { splitSeatLayerFromPrice };
import { seatLayerPickerColorAlpha, type resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { seatLayerPickerTokens } from './tokens.g';

type Theme = ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;

/**
 * The collapsed cart's head (spec §3.9).
 *
 * THE BAR IS EXACTLY ITS HEAD: one number for the collapsed surface, so its
 * own 44 pt buttons cannot lose their lower edge to a shorter clip. The head
 * itself is the toggle — there is no chevron on the collapsed bar, and the head
 * carries the toggle's role, name and expanded state so a screen-reader buyer
 * keeps the only named way into the cart.
 */

/** The head's own inset: the summary starts at it, the buttons sit against it. */
export const seatLayerPeekHeadInset = 12;
const findPillPadding = 20;
const continuePillPadding = 18;

export interface SeatLayerCartPeekHeadProps {
  readonly line: SeatLayerPeekLine;
  readonly expanded: boolean;
  readonly theme: Theme;
  readonly toggleLabel: string;
  readonly summarySwell: Animated.Value;
  readonly summaryStyle?: StyleProp<TextStyle>;
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly height: number;
  readonly onToggle: () => void;
  /** Rendered against the head's trailing inset: Continue, or Find seats. */
  readonly action?: React.ReactNode;
  readonly panHandlers?: Partial<GestureResponderHandlers>;
}

export function SeatLayerCartPeekHead(props: SeatLayerCartPeekHeadProps): React.ReactElement {
  const { expanded, line, theme } = props;
  const summarySize = expanded
    ? seatLayerPickerTokens.type.peekSummaryOpen.size
    : seatLayerPickerTokens.type.peekSummary.size;
  const summaryWeight = String(expanded
    ? seatLayerPickerTokens.type.peekSummaryOpen.weight
    : seatLayerPickerTokens.type.peekSummary.weight) as 'normal';
  const words = line.sentence ?? line.summary ?? '';
  const price = splitSeatLayerFromPrice(words, line.fromAmount);
  const muted = {
    color: expanded ? theme.colors.text : theme.colors.mutedText,
    fontFamily: theme.fontFamily,
    fontSize: summarySize,
    fontWeight: summaryWeight,
  } as const;
  return (
    <View
      style={[{
        alignItems: 'center',
        flexDirection: 'row',
        height: props.height,
        paddingEnd: seatLayerPeekHeadInset,
        paddingStart: seatLayerPeekHeadInset,
        // The head grows by the clock lift so its row sits below the grabber:
        // without it a 44 pt button covers the grabber painted in the top 4 pt.
        paddingTop: seatLayerPickerTokens.size.peekClockLift,
      }, props.containerStyle]}
      testID="seatlayer-cart-peek-head"
      {...(props.panHandlers ?? {})}
    >
      <View
        accessible={false}
        pointerEvents="none"
        testID="seatlayer-cart-grabber"
        style={{
          alignItems: 'center',
          left: 0,
          position: 'absolute',
          top: seatLayerPickerTokens.size.sheetGrabberInset,
          width: '100%',
        }}
      >
        <View style={{
          backgroundColor: theme.colors.mutedText,
          borderRadius: seatLayerPickerTokens.radius.pill,
          height: seatLayerPickerTokens.size.sheetGrabberHeight,
          opacity: .4,
          width: seatLayerPickerTokens.size.sheetGrabberWidth,
        }} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.toggleLabel}
        accessibilityState={{ expanded }}
        accessibilityLiveRegion="polite"
        onPress={props.onToggle}
        testID="seatlayer-cart-head-toggle"
        style={{ flex: 1, justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget }}
      >
        <Animated.View style={{
          alignSelf: 'flex-start',
          transform: [{ scale: props.summarySwell.interpolate({ inputRange: [0, .55, 1], outputRange: [1, 1.08, 1] }) }],
        }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[muted, props.summaryStyle]}>
            {price.before}
            {price.amount === null ? null : (
              <Text style={{
                color: theme.colors.text,
                fontFamily: theme.fontFamily,
                fontSize: seatLayerPickerTokens.type.peekFromPrice.size,
                fontVariant: ['tabular-nums'],
                fontWeight: String(seatLayerPickerTokens.type.peekFromPrice.weight) as 'normal',
              }}>{price.amount}</Text>
            )}
            {price.after}
          </Text>
        </Animated.View>
      </Pressable>
      {props.action}
    </View>
  );
}

/** The bar's one door on the empty cart, drawn as the primary action it is. */
export function SeatLayerFindSeatsPill({ label, theme, onPress }: Readonly<{
  label: string;
  theme: Theme;
  onPress: () => void;
}>): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID="seatlayer-cart-find-seats"
      style={({ pressed }) => ({ marginStart: 8, opacity: pressed ? .8 : 1 })}
    >
      <View style={{
        alignItems: 'center',
        backgroundColor: theme.colors.accent,
        borderRadius: seatLayerPickerTokens.radius.peekButton,
        flexDirection: 'row',
        gap: 6,
        height: seatLayerPickerTokens.size.findPillHeight,
        justifyContent: 'center',
        paddingHorizontal: findPillPadding,
      }}>
        <Text accessible={false} style={{ color: theme.colors.onAccent, fontFamily: theme.fontFamily, fontSize: 15 }}>✦</Text>
        <Text numberOfLines={1} style={{
          color: theme.colors.onAccent,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.findPill.size,
          fontWeight: String(seatLayerPickerTokens.type.findPill.weight) as 'normal',
        }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The collapsed bar's way to pay. It carries the words and the total and NO
 * clock (owner call, 2026-09-05): a clock inside the button read as clutter on
 * the phone, and the header's hold pill is the picker's one clock.
 */
export function SeatLayerPeekContinuePill({ label, total, theme, busy, onPress, style, textStyle }: Readonly<{
  label: string;
  total: string | null;
  theme: Theme;
  busy: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}>): React.ReactElement {
  const words = total === null ? label : `${label} · ${total}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words}
      accessibilityState={{ busy }}
      onPress={onPress}
      testID="seatlayer-cart-continue-pill"
      style={({ pressed }) => ({ marginStart: 8, opacity: pressed ? .8 : 1 })}
    >
      <View style={[{
        alignItems: 'center',
        backgroundColor: theme.colors.accent,
        borderRadius: seatLayerPickerTokens.radius.peekButton,
        height: seatLayerPickerTokens.size.peekButtonHeight,
        justifyContent: 'center',
        paddingHorizontal: continuePillPadding,
      }, style]}>
        <Text numberOfLines={1} style={[{
          color: theme.colors.onAccent,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.peekPill.size,
          fontVariant: ['tabular-nums'],
          fontWeight: String(seatLayerPickerTokens.type.peekPill.weight) as 'normal',
        }, textStyle]}>{words}</Text>
      </View>
    </Pressable>
  );
}

/** The open sheet's way back down; the collapsed bar has none. */
export function SeatLayerSheetChevron({ label, theme, progress, onPress }: Readonly<{
  label: string;
  theme: Theme;
  progress: Animated.Value;
  onPress: () => void;
}>): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: true }}
      onPress={onPress}
      testID="seatlayer-cart-disclosure"
      style={({ pressed }) => ({
        alignItems: 'center',
        height: seatLayerPickerTokens.size.minimumHitTarget,
        justifyContent: 'center',
        marginStart: 4,
        opacity: pressed ? .62 : 1,
        width: seatLayerPickerTokens.size.minimumHitTarget,
      })}
    >
      <View style={{
        alignItems: 'center',
        height: seatLayerPickerTokens.size.sheetToggleOpenSize,
        justifyContent: 'center',
        width: seatLayerPickerTokens.size.sheetToggleOpenSize,
      }}>
        <Animated.View style={{
          borderBottomColor: theme.colors.text,
          borderBottomWidth: 2,
          borderRightColor: theme.colors.text,
          borderRightWidth: 2,
          height: 9,
          transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['225deg', '45deg'] }) }],
          width: 9,
        }} />
      </View>
    </Pressable>
  );
}

/** `Powered by SeatLayer`, centred at the foot where a corner cannot clip it. */
export function SeatLayerSheetFoot({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <View
      testID="seatlayer-cart-attribution-foot"
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: seatLayerPickerTokens.size.attributionHeight,
      }}
    >
      {children}
    </View>
  );
}

export const seatLayerPeekHeadStyles = StyleSheet.create({
  hidden: { display: 'none' },
});
