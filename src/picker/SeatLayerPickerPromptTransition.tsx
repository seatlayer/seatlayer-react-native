import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { resolveSeatLayerPickerMotion } from './motion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';

export interface SeatLayerPickerPromptTransitionProps {
  readonly prompt: ReactNode | null;
  /** Stable presentation identity; node rebuilds with the same key do not animate. */
  readonly promptKey: string | number | null;
  readonly scrimColor: string;
  /** A controller/runtime replacement must never retain an old prompt surface. */
  readonly sessionId: string | number;
}

type TransitionState = Readonly<{ current: ReactNode | null; currentKey: string | number | null; outgoing: ReactNode | null }>;
const empty: TransitionState = Object.freeze({ current: null, currentKey: null, outgoing: null });
const promptProjectionRatio = 0.035;
const promptScale = 0.965;

/** Scoped adaptive prompt transition; it owns no prompt/back/presentation state. */
export function SeatLayerPickerPromptTransition({
  prompt,
  promptKey,
  scrimColor,
  sessionId,
}: SeatLayerPickerPromptTransitionProps): React.ReactElement {
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const [surfaces, setSurfaces] = useState<TransitionState>(() => (
    prompt === null ? empty : { current: prompt, currentKey: promptKey, outgoing: null }
  ));
  const [height, setHeight] = useState(0);
  const enter = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const input = useRef<{ readonly seen: boolean; readonly prompt: ReactNode | null; readonly promptKey: string | number | null; readonly sessionId: string | number }>({ seen: false, prompt: null, promptKey: null, sessionId });
  const sessionRef = useRef(sessionId);
  const generation = useRef(0);
  const enterAnimation = useRef<ReturnType<typeof Animated.timing> | undefined>(undefined);
  const exitAnimation = useRef<ReturnType<typeof Animated.timing> | undefined>(undefined);
  useLayoutEffect(() => { sessionRef.current = sessionId; setHeight(0); }, [sessionId]);

  useEffect(() => {
    const previous = input.current;
    const replaced = previous.seen && previous.sessionId !== sessionId;
    if (reducedMotion) {
      enterAnimation.current?.stop(); exitAnimation.current?.stop();
      enterAnimation.current = undefined; exitAnimation.current = undefined;
      enter.setValue(surfaces.current === null ? 0 : 1); exit.setValue(0);
      if (surfaces.outgoing !== null) setSurfaces((value) => ({ ...value, outgoing: null }));
    }
    if (!replaced && previous.seen && previous.promptKey === promptKey) {
      if (prompt !== previous.prompt) setSurfaces((value) => value.currentKey === promptKey ? { ...value, current: prompt } : value);
      input.current = { seen: true, prompt, promptKey, sessionId };
      return undefined;
    }
    input.current = { seen: true, prompt, promptKey, sessionId };
    generation.current += 1;
    const token = generation.current;
    enterAnimation.current?.stop(); exitAnimation.current?.stop();
    if (replaced) {
      exit.setValue(0);
      setSurfaces({ current: prompt, currentKey: promptKey, outgoing: null });
      if (prompt === null) { enter.setValue(0); return undefined; }
      playEnter(enter, reducedMotion, token, generation, enterAnimation);
      return undefined;
    }
    const outgoing = previous.prompt;
    setSurfaces({ current: prompt, currentKey: promptKey, outgoing });
    if (outgoing !== null) playExit(exit, reducedMotion, token, generation, exitAnimation, () => {
      if (generation.current === token) setSurfaces((value) => ({ ...value, outgoing: null }));
    });
    if (prompt !== null) {
      playEnter(enter, reducedMotion, token, generation, enterAnimation);
      return undefined;
    }
    enter.setValue(0);
    return undefined;
  }, [enter, exit, prompt, promptKey, reducedMotion, sessionId]);
  useEffect(() => () => {
    generation.current += 1;
    enterAnimation.current?.stop(); exitAnimation.current?.stop();
  }, [enterAnimation, exitAnimation]);

  const present = surfaces.current !== null || surfaces.outgoing !== null;
  return (
    <View onLayout={(event) => {
      if (sessionRef.current !== sessionId) return;
      const next = event.nativeEvent.layout.height;
      if (typeof next === 'number' && Number.isFinite(next)) setHeight(Math.max(0, next));
    }} pointerEvents={present ? 'auto' : 'none'} style={[styles.root, { backgroundColor: present ? scrimColor : 'transparent' }]}>
      {surfaces.outgoing === null ? null : <Animated.View pointerEvents="none" style={[styles.surface, exitStyle(exit, height * promptProjectionRatio)]}>{surfaces.outgoing}</Animated.View>}
      {surfaces.current === null ? null : <Animated.View pointerEvents="auto" style={[styles.surface, enterStyle(enter, height * promptProjectionRatio)]}>{surfaces.current}</Animated.View>}
    </View>
  );
}

function playEnter(
  value: Animated.Value,
  reduced: boolean,
  token: number,
  generation: React.MutableRefObject<number>,
  target: React.MutableRefObject<ReturnType<typeof Animated.timing> | undefined>,
): void {
  const motion = resolveSeatLayerPickerMotion('enter', reduced, 'easeEnter');
  value.setValue(0);
  if (motion.durationMs === 0) { value.setValue(1); return; }
  const animation = Animated.timing(value, { toValue: 1, duration: motion.durationMs, easing: easingFor(motion.curve.cubicBezier), useNativeDriver: true });
  target.current = animation;
  animation.start(() => { if (generation.current === token && target.current === animation) target.current = undefined; });
}

function playExit(
  value: Animated.Value,
  reduced: boolean,
  token: number,
  generation: React.MutableRefObject<number>,
  target: React.MutableRefObject<ReturnType<typeof Animated.timing> | undefined>,
  complete: () => void,
): void {
  const motion = resolveSeatLayerPickerMotion('exit', reduced, 'easeExit');
  value.setValue(0);
  if (motion.durationMs === 0) { value.setValue(1); complete(); return; }
  const animation = Animated.timing(value, { toValue: 1, duration: motion.durationMs, easing: easingFor(motion.curve.cubicBezier), useNativeDriver: true });
  target.current = animation;
  animation.start(({ finished }) => {
    if (finished && generation.current === token && target.current === animation) {
      target.current = undefined; complete();
    }
  });
}

function enterStyle(value: Animated.Value, projection: number): object {
  return { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [projection, 0] }) }, { scale: value.interpolate({ inputRange: [0, 1], outputRange: [promptScale, 1] }) }] };
}
function exitStyle(value: Animated.Value, projection: number): object {
  return { opacity: value.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, projection] }) }, { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, promptScale] }) }] };
}
function easingFor(curve: readonly number[]): (value: number) => number {
  return Easing.bezier(curve[0] ?? 0, curve[1] ?? 0, curve[2] ?? 1, curve[3] ?? 1);
}

const fill = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };
const styles = StyleSheet.create({ root: fill, surface: fill });
