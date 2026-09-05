import React, { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    const enter = resolveSeatLayerPickerMotion('enter', reducedMotion, 'easeEnter');
    const stagger = resolveSeatLayerPickerMotion('stagger', reducedMotion, 'easeEnter');
    progress.stopAnimation();
    if (enter.durationMs === 0 || stagger.skipped) {
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
  const [rendered, setRendered] = useState<ReactNode>(children);
  useEffect(() => {
    if (previous.current === token) {
      setRendered(children);
      return undefined;
    }
    previous.current = token;
    const motion = resolveSeatLayerPickerMotion('crossfade', reducedMotion, 'easeEnter');
    // Under reduced motion the new words are simply there.
    if (motion.durationMs === 0) {
      opacity.setValue(1);
      setRendered(children);
      return undefined;
    }
    const [x1, y1, x2, y2] = motion.curve.cubicBezier;
    opacity.stopAnimation();
    opacity.setValue(0);
    setRendered(children);
    const animation = Animated.timing(opacity, {
      duration: motion.durationMs,
      easing: Easing.bezier(x1, y1, x2, y2),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [children, opacity, reducedMotion, token]);
  return <Animated.View style={[style, { opacity }]}>{rendered}</Animated.View>;
}

/**
 * A ticket the buyer can push out of the list.
 *
 * Deliberately not a dismissible: the cart is the source of truth and the row
 * disappears because the snapshot no longer has it. A held row is never
 * swipeable — those seats belong to a hold, and the row says so with a lock.
 */
export function SeatLayerCartSwipeToRemove({ enabled, onRemove, children }: Readonly<{
  enabled: boolean;
  onRemove: () => void;
  children: ReactNode;
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
