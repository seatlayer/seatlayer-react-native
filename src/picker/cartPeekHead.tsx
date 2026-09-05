import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type GestureResponderHandlers, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useSeatLayerPickerBlockedRegion } from './blockedRegionsContext';
import { splitSeatLayerFromPrice, type SeatLayerPeekLine } from './checkoutCta';

export { splitSeatLayerFromPrice };
import { seatLayerPickerColorAlpha, type resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerFontWeight } from './fontWeight';

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
  const summaryWeight = seatLayerPickerFontWeight(expanded
    ? seatLayerPickerTokens.type.peekSummaryOpen.weight
    : seatLayerPickerTokens.type.peekSummary.weight);
  const words = line.sentence ?? line.summary ?? '';
  const price = splitSeatLayerFromPrice(words, line.fromAmount);
  const lifts = !expanded && price.amount !== null;
  const muted = {
    // Muted only where something IS lifted out of the line: a sentence with no
    // loud part is the line the buyer reads, and reading it at caption strength
    // makes the collapsed bar look disabled.
    color: lifts ? theme.colors.mutedText : theme.colors.text,
    fontFamily: theme.fontFamily,
    fontSize: summarySize,
    fontWeight: summaryWeight,
  } as const;
  // §2.4 — the sheet head stands over the map's foot and takes its own touch.
  const blocked = useSeatLayerPickerBlockedRegion();
  return (
    <View
      collapsable={false}
      onLayout={blocked.onLayout}
      ref={blocked.ref as never}
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
          {/* The amount is lifted out of the sentence only on the COLLAPSED
              bar, where the money is what the buyer reads the bar for. Open,
              the line is one weight throughout — every other reading of it, a
              ticket count or a whole sentence, already is. */}
          <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('peek')} numberOfLines={1} ellipsizeMode="tail" style={[muted, props.summaryStyle]}>
            {!lifts || price.amount === null
              ? words
              : (
                <>
                  {price.before}
                  <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('peek')} style={{
                    color: theme.colors.text,
                    fontFamily: theme.fontFamily,
                    fontSize: seatLayerPickerTokens.type.peekFromPrice.size,
                    fontVariant: ['tabular-nums'],
                    fontWeight: seatLayerPickerFontWeight(seatLayerPickerTokens.type.peekFromPrice.weight),
                  }}>{price.amount}</Text>
                  {price.after}
                </>
              )}
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
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('peek')} accessible={false} style={{ color: theme.colors.onAccent, fontFamily: theme.fontFamily, fontSize: 15 }}>✦</Text>
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('peek')} numberOfLines={1} style={{
          color: theme.colors.onAccent,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.findPill.size,
          fontWeight: seatLayerPickerFontWeight(seatLayerPickerTokens.type.findPill.weight),
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
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('peek')} numberOfLines={1} style={[{
          color: theme.colors.onAccent,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.peekPill.size,
          fontVariant: ['tabular-nums'],
          fontWeight: seatLayerPickerFontWeight(seatLayerPickerTokens.type.peekPill.weight),
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
          borderBottomWidth: 1.9,
          borderRightColor: theme.colors.text,
          borderRightWidth: 1.9,
          height: chevronArm,
          transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['225deg', '45deg'] }) }],
          width: chevronArm,
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

/**
 * Arm of the sheet's chevron, measured corner to corner: two edges of a square
 * turned 45 degrees span the square's own side times root two, so the arm is
 * the reference's ten-point chevron divided back down rather than the ten.
 */
const chevronArm = 6.9;

export const seatLayerPeekHeadStyles = StyleSheet.create({
  hidden: { display: 'none' },
});
