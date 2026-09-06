import React, { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, I18nManager, PanResponder, View, type ViewStyle } from 'react-native';

import { seatLayerCartSwipeCommits, seatLayerCartSwipeTravel } from './cartSwipe';
import { resolveSeatLayerPickerMotion } from './motion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';

/**
 * The cart list's three motions (spec §3.10.2 and §3.13).
 *
 * A row arrives with a small rise and scale-up; only the CELL whose words
 * changed cross-fades, never the list around it; and a swipe settles from the
 * finger rather than being handed to a dismissible that owns the removal.
 * Under reduced motion there is no cross-fade at all: the new words are there.
 */

/** One newly mounted run settles in; a set arrives in a bounded sequence. */
export function SeatLayerCartRowArrival(
  { index, children }: Readonly<{ index: number; children: ReactNode }>,
): React.ReactElement {
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const progress = useRef(new Animated.Value(reducedMotion || index < 0 ? 1 : 0)).current;
  useEffect(() => {
    const enter = resolveSeatLayerPickerMotion('enter', reducedMotion, 'easeEnter');
    const stagger = resolveSeatLayerPickerMotion('stagger', reducedMotion, 'easeEnter');
    progress.stopAnimation();
    // A card that was already in the cart has not arrived: only the set that
    // landed this frame is staged, so a removal does not replay the whole list.
    if (index < 0 || enter.durationMs === 0 || stagger.skipped) {
      progress.setValue(1);
      return undefined;
    }
    progress.setValue(0);
    const maximumDelay = Math.max(0, resolveSeatLayerPickerMotion('fly', false).durationMs - enter.durationMs);
    const delay = Math.min(maximumDelay, Math.max(0, index) * stagger.durationMs);
    const [x1, y1, x2, y2] = enter.curve.cubicBezier;
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, {
        duration: enter.durationMs,
        easing: Easing.bezier(x1, y1, x2, y2),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, progress, reducedMotion]);
  return <Animated.View style={{
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [.96, 1] }) },
    ],
  }}>{children}</Animated.View>;
}

/**
 * One cell that swaps its own words in place, keyed on the words themselves.
 *
 * `103 · A · 9–10` becomes `103 · A · 10` when one seat of a run goes. The
 * address is the same ticket either way, so the cell swaps rather than the list
 * redrawing around it.
 */
export function SeatLayerCartCellCrossFade(
  { token, style, children }: Readonly<{ token: string; style?: ViewStyle; children: ReactNode }>,
): React.ReactElement {
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const previous = useRef(token);
  // KEYED ON THE WORDS, AND ON NOTHING ELSE. It used to hold the drawn children
  // in state and list them as a dependency, so every render of the cell re-ran
  // the effect: a render that arrived mid-fade took the "same words" branch,
  // the cleanup stopped the fade that was still running, and the cell stayed at
  // zero. The total line, which re-renders on its own swell, printed nothing.
  useEffect(() => {
    if (previous.current === token) return undefined;
    previous.current = token;
    const motion = resolveSeatLayerPickerMotion('crossfade', reducedMotion, 'easeEnter');
    // Under reduced motion the new words are simply there.
    if (motion.durationMs === 0) {
      opacity.setValue(1);
      return undefined;
    }
    const [x1, y1, x2, y2] = motion.curve.cubicBezier;
    opacity.stopAnimation();
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      duration: motion.durationMs,
      easing: Easing.bezier(x1, y1, x2, y2),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    // A fade that is torn down owes the words their ink back: the value outlives
    // the effect, and a cell left at zero is a cell that says nothing.
    return () => { animation.stop(); opacity.setValue(1); };
  }, [opacity, reducedMotion, token]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/**
 * A ticket the buyer can push out of the list.
 *
 * Deliberately not a dismissible: the cart is the source of truth and the row
 * disappears because the snapshot no longer has it. A held row is never
 * swipeable — those seats belong to a hold, and the row says so with a lock.
 */
export function SeatLayerCartSwipeToRemove({ enabled, onRemove, children, radius, plateColor, plateInk }: Readonly<{
  enabled: boolean;
  onRemove: () => void;
  children: ReactNode;
  /** The card's own corner: the plate under it is clipped to the same one. */
  radius?: number;
  /**
   * The one place in the picker that is never the accent: a brand colour that
   * happens to be red would make every other swipe look like a warning.
   */
  plateColor?: string;
  plateInk?: string;
}>): React.ReactElement {
  const reducedMotion = useSeatLayerPickerReducedMotion();
  // The pan responder is built once; the live preference is read through a ref.
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const offset = useRef(new Animated.Value(0)).current;
  const travel = useRef(0);
  const width = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Which way the remove edge is on screen is the writing direction's business.
  const direction = I18nManager.isRTL ? 1 : -1;
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      enabledRef.current && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => {
      if (!enabledRef.current) return;
      travel.current = seatLayerCartSwipeTravel(gesture.dx * direction, width.current);
      offset.setValue(travel.current * direction);
    },
    onPanResponderRelease: (_event, gesture) => {
      const committed = enabledRef.current && seatLayerCartSwipeCommits({
        travel: travel.current,
        width: width.current,
        velocity: gesture.vx * direction * 1_000,
      });
      travel.current = 0;
      // §4.4 — the settle spring has no reduced form; under reduced motion the
      // row is simply back where it started.
      settle(offset, reducedMotionRef.current);
      if (committed) onRemove();
    },
    onPanResponderTerminate: () => {
      travel.current = 0;
      settle(offset, reducedMotionRef.current);
    },
  })).current;
  return (
    <View
      onLayout={(event) => { width.current = event.nativeEvent.layout.width; }}
      testID="seatlayer-cart-swipe"
      {...(enabled ? responder.panHandlers : {})}
    >
      {enabled && plateColor
        ? (
          <Animated.View
            accessible={false}
            pointerEvents="none"
            testID="seatlayer-cart-swipe-plate"
            style={{
              alignItems: I18nManager.isRTL ? 'flex-start' : 'flex-end',
              backgroundColor: plateColor,
              borderRadius: radius ?? 0,
              bottom: 0,
              justifyContent: 'center',
              left: 0,
              // Only drawn while there is something to see, so a list at rest
              // is the same list it has always been.
              opacity: offset.interpolate({
                inputRange: [-1, 0, 1], outputRange: [1, 0, 1], extrapolate: 'clamp',
              }),
              paddingHorizontal: 14,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          >
            <View style={{
              borderColor: plateInk ?? '#FFFFFF',
              borderRadius: 2,
              borderWidth: 1.4,
              height: 12,
              width: 10,
            }} />
          </Animated.View>
        )
        : null}
      <Animated.View style={{ transform: [{ translateX: offset }] }}>{children}</Animated.View>
    </View>
  );
}

/** The row's return to rest: a spring, or no motion at all. */
function settle(offset: Animated.Value, reducedMotion: boolean): void {
  if (reducedMotion) {
    offset.setValue(0);
    return;
  }
  Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
}
