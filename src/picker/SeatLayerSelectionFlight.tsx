import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { resolveSeatLayerPickerMotion } from './motion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';

export interface SeatLayerSelectionFlightMoment {
  readonly id: number;
  readonly color: string;
  readonly from: Readonly<{ x: number; y: number }>;
  readonly to: Readonly<{ x: number; y: number }>;
}

/** The non-interactive visual link between a confirmed seat and the cart. */
export function SeatLayerSelectionFlight({
  moment,
  onComplete,
}: Readonly<{
  moment: SeatLayerSelectionFlightMoment;
  onComplete: (id: number) => void;
}>): React.ReactElement | null {
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const completeRef = useRef(onComplete);
  useLayoutEffect(() => { completeRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const motion = resolveSeatLayerPickerMotion('fly', reducedMotion, 'easeEnter');
    progress.stopAnimation();
    progress.setValue(0);
    if (motion.skipped || motion.durationMs === 0) {
      completeRef.current(moment.id);
      return undefined;
    }
    const animation = Animated.timing(progress, {
      duration: motion.durationMs,
      easing: Easing.inOut(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished) completeRef.current(moment.id); });
    return () => animation.stop();
  }, [moment.id, progress, reducedMotion]);
  if (reducedMotion) return null;
  return <View pointerEvents="none" style={styles.overlay} testID="seatlayer-selection-flight">
    <Animated.View style={[styles.dot, {
      backgroundColor: moment.color,
      opacity: progress.interpolate({ inputRange: [0, .72, 1], outputRange: [1, .78, 0] }),
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [moment.from.x, moment.to.x] }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [moment.from.y, moment.to.y] }) },
        { scale: progress.interpolate({ inputRange: [0, .75, 1], outputRange: [1, 1, .72] }) },
      ],
    }]} />
  </View>;
}

const styles = StyleSheet.create({
  overlay: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 80 },
  dot: {
    borderRadius: 6,
    height: 12,
    left: -6,
    position: 'absolute',
    top: -6,
    width: 12,
  },
});
