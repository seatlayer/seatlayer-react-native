import React from 'react';
import { Animated, Pressable, View, type GestureResponderHandlers } from 'react-native';

import { useSeatLayerPickerBlockedRegion } from './blockedRegionsContext';
import type { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerSheetLayout } from './sheetLayout';

type Theme = ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;

/**
 * The sheet's handle: a disc straddling the sheet's own top edge, the way a
 * drawer handle sits on a drawer (spec §3.9).
 *
 * It used to be a grab bar and, separately, a chevron in a corner — the state
 * and the control that changes it drawn as two different things. It is one
 * thing now: the chevron lives INSIDE the disc and turns over when the sheet
 * opens. White, lifted by its own shadow, `size.sheetHandleOverhang` above the
 * edge and the rest inside, with NOTHING DRAWN UNDER IT — no divider, no band.
 *
 * A port that draws the disc outside its parent's own box must make the parent
 * take the overhang into its height, or the upper half is neither painted nor
 * pressable. In React Native that is the parent's `overflow: 'visible'` plus a
 * head strip of `size.sheetHeadHeight` under it.
 */
export interface SeatLayerSheetHandleProps {
  readonly expanded: boolean;
  readonly theme: Theme;
  readonly label: string;
  /** 0 shut, 1 open; the chevron turns over it. */
  readonly progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  readonly onPress: () => void;
  /** The sheet's own drag runs under the whole band. */
  readonly panHandlers?: Partial<GestureResponderHandlers>;
}

export function SeatLayerSheetHandle(props: SeatLayerSheetHandleProps): React.ReactElement {
  const { theme } = props;
  const overhang = seatLayerPickerSheetLayout(theme).sheetHandleOverhang;
  const head = seatLayerPickerSheetLayout(theme).sheetHeadHeight;
  // §2.4 — the disc's upper half stands over the map's foot and takes its own
  // touch; the map is told so it does not treat the tap as a seat press.
  const blocked = useSeatLayerPickerBlockedRegion();
  return (
    <View
      collapsable={false}
      onLayout={blocked.onLayout}
      pointerEvents="box-none"
      ref={blocked.ref as never}
      style={{
        alignItems: 'center',
        height: overhang + head,
        left: 0,
        position: 'absolute',
        right: 0,
        top: -overhang,
      }}
      testID="seatlayer-cart-handle-band"
      {...(props.panHandlers ?? {})}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.label}
        accessibilityState={{ expanded: props.expanded }}
        onPress={props.onPress}
        testID="seatlayer-cart-handle"
        style={({ pressed }) => ({
          alignItems: 'center',
          // The disc keeps its own size whatever strip the sheet lends it: a
          // head shorter than the disc must not squash it into an oval.
          backgroundColor: theme.colors.background,
          borderRadius: seatLayerPickerTokens.radius.pill,
          elevation: 3,
          height: seatLayerPickerSheetLayout(theme).sheetHandleHeight,
          justifyContent: 'center',
          opacity: pressed ? .86 : 1,
          shadowColor: '#000000',
          shadowOffset: { height: 2, width: 0 },
          shadowOpacity: .2,
          shadowRadius: 5,
          width: seatLayerPickerSheetLayout(theme).sheetHandleWidth,
        })}
      >
        <Animated.View
          accessible={false}
          style={{
            borderBottomColor: theme.colors.mutedText,
            borderBottomWidth: 1.9,
            borderRightColor: theme.colors.mutedText,
            borderRightWidth: 1.9,
            height: chevronArm,
            // Points UP while shut, and turns over on `motion.duration.chevron`
            // when the sheet opens: the state and the control are one thing.
            marginTop: 3,
            transform: [{ rotate: interpolateTurn(props.progress) }],
            width: chevronArm,
          }}
        />
      </Pressable>
    </View>
  );
}

function interpolateTurn(
  progress: SeatLayerSheetHandleProps['progress'],
): Animated.AnimatedInterpolation<string> {
  return (progress as Animated.Value).interpolate({
    inputRange: [0, 1],
    outputRange: ['225deg', '45deg'],
  });
}

/**
 * Arm of the chevron, measured corner to corner: two edges of a square turned
 * 45 degrees span the square's own side times root two, so the arm is the
 * reference's sixteen-point chevron divided back down rather than the sixteen.
 */
const chevronArm = 5.6;
