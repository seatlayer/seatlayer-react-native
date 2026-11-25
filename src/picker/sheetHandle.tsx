import React from 'react';
import { Animated, Pressable, View } from 'react-native';

import { seatLayerCartBarSize as bar } from './cartBarRule';
import { seatLayerPickerLineWidth } from './lineWidth';
import type { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { seatLayerPickerTokens } from './tokens.g';

type Theme = ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;

/**
 * The cart row's circle: the one named control that opens and closes the list.
 *
 * Its arrow points up while the list is shut and turns over when it opens, so
 * the state and the control that changes it are one thing. Drawn at 28 points,
 * pressed over 44.
 */
export interface SeatLayerSheetHandleProps {
  readonly expanded: boolean;
  readonly theme: Theme;
  readonly label: string;
  /** 0 shut, 1 open; the arrow turns over it. */
  readonly progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  readonly onPress: () => void;
  /** A seat card is asking: the circle is not drawn and its place is kept. */
  readonly hidden: boolean;
}

const target = seatLayerPickerTokens.size.minimumHitTarget;
const reach = (target - bar.disc) / 2;

export function SeatLayerSheetHandle(props: SeatLayerSheetHandleProps): React.ReactElement {
  const { theme } = props;
  if (props.hidden) return <View style={{ height: bar.disc, width: bar.disc }} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ expanded: props.expanded }}
      onPress={props.onPress}
      testID="seatlayer-cart-handle"
      style={({ pressed }) => ({
        alignItems: 'center',
        height: target,
        justifyContent: 'center',
        margin: -reach,
        opacity: pressed ? .7 : 1,
        width: target,
      })}
    >
      <View
        accessible={false}
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.background,
          borderColor: theme.colors.divider,
          borderRadius: bar.disc / 2,
          borderWidth: seatLayerPickerLineWidth,
          height: bar.disc,
          justifyContent: 'center',
          width: bar.disc,
        }}
        testID="seatlayer-cart-handle-disc"
      >
        <Animated.View
          style={{
            alignItems: 'center',
            height: bar.chevron,
            justifyContent: 'center',
            transform: [{ rotate: turned(props.progress) }],
            width: bar.chevron,
          }}
        >
          {arms.map(({ rotate, translateX }) => (
            <View
              key={rotate}
              style={{
                backgroundColor: theme.colors.text,
                borderRadius: stroke / 2,
                height: stroke,
                position: 'absolute',
                transform: [{ translateX }, { rotate }],
                width: arm,
              }}
            />
          ))}
        </Animated.View>
      </View>
    </Pressable>
  );
}

function turned(progress: SeatLayerSheetHandleProps['progress']): Animated.AnimatedInterpolation<string> {
  return (progress as Animated.Value).interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
}

/** The arrow is 12 by 6 in a box of 24, with a stroke of 2.6. */
const unit = bar.chevron / 24;
const stroke = 2.6 * unit;
const arm = 6 * Math.SQRT2 * unit + stroke;
/** Placed by transforms, which the reading direction does not turn round. */
const arms = [
  { rotate: '-45deg', translateX: -3 * unit },
  { rotate: '45deg', translateX: 3 * unit },
] as const;
