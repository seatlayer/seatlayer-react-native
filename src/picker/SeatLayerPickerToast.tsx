import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { resolveSeatLayerPickerMotion } from './motion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import {
  SeatLayerToastQueue,
  seatLayerToastActionHitBox,
  seatLayerToastCardLift,
  type SeatLayerToast,
  type SeatLayerToastRequest,
  type SeatLayerToastTone,
} from './toastQueue';
import { useSeatLayerPickerBlockedRegion } from './blockedRegionsContext';
import { seatLayerPickerTokens } from './tokens.g';

/**
 * The picker's own toast (spec §3.12) — NOT the host's messenger.
 *
 * One centred card in the bottom-centre region, lifted clear of the dock. It
 * WRAPS: a toast is a sentence, not a chip. Tones change only the border. It is
 * announced outright as well as being a live region, because a toast that
 * arrives and leaves inside four seconds is a window a live region cannot be
 * relied on to catch (§4.10).
 */

/** The toast card's own corner is a fixed recipe, not a shared radius token. */
const toastCornerRadius = 16;

export interface SeatLayerPickerToastCardProps {
  readonly toast: SeatLayerToast;
  readonly theme: ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;
  readonly onAction?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

function toneBorder(
  tone: SeatLayerToastTone,
  theme: SeatLayerPickerToastCardProps['theme'],
): string {
  if (tone === 'error') return theme.colors.error;
  if (tone === 'warning') return theme.colors.accent;
  if (tone === 'success') return '#2E9E5B';
  return theme.colors.divider;
}

export function SeatLayerPickerToastCard(props: SeatLayerPickerToastCardProps): React.ReactElement {
  const { theme, toast } = props;
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const rise = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const motion = resolveSeatLayerPickerMotion('toast', reducedMotion, 'easeEnter');
    rise.stopAnimation();
    if (motion.durationMs === 0) {
      rise.setValue(1);
      return undefined;
    }
    rise.setValue(0);
    const [x1, y1, x2, y2] = motion.curve.cubicBezier;
    const animation = Animated.timing(rise, {
      duration: motion.durationMs, easing: Easing.bezier(x1, y1, x2, y2),
      toValue: 1, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, rise, toast.id]);
  useEffect(() => {
    // Error shakes once.
    if (toast.tone !== 'error' || reducedMotion) return undefined;
    shake.setValue(0);
    const animation = Animated.sequence([-1, 1, -0.5, 0].map((value) => Animated.timing(shake, {
      duration: 60, easing: Easing.linear, toValue: value, useNativeDriver: true,
    })));
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, shake, toast.id, toast.tone]);
  return (
    <Animated.View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={toast.message}
      testID="seatlayer-picker-toast"
      style={[{
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: theme.colors.surface,
        borderColor: toneBorder(toast.tone, theme),
        borderRadius: toastCornerRadius,
        borderWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: 10,
        maxWidth: 420,
        opacity: rise,
        paddingHorizontal: 14,
        paddingVertical: 10,
        transform: [
          { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) },
        ],
      }, props.style]}
    >
      <Text
        accessible={false}
        style={{
          color: theme.colors.text,
          flexShrink: 1,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.peekSummary.size,
          fontWeight: String(seatLayerPickerTokens.type.peekSummary.weight) as 'normal',
        }}
      >{toast.message}</Text>
      {toast.actionLabel === null
        ? null
        : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            onPress={props.onAction}
            testID="seatlayer-picker-toast-action"
            // A FIXED 44 pt hit box: an action sized by its own words is a
            // different target in every locale.
            style={{
              alignItems: 'center',
              height: seatLayerToastActionHitBox,
              justifyContent: 'center',
              minWidth: seatLayerToastActionHitBox,
            }}
          >
            <View style={{
              backgroundColor: theme.colors.accent,
              borderRadius: seatLayerPickerTokens.radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}>
              <Text style={{
                color: theme.colors.onAccent,
                fontFamily: theme.fontFamily,
                fontSize: seatLayerPickerTokens.type.peekSummary.size,
                fontWeight: '800',
              }}>{toast.actionLabel}</Text>
            </View>
          </Pressable>
        )}
    </Animated.View>
  );
}

export interface SeatLayerPickerToastLayerProps {
  readonly queue: SeatLayerToastQueue;
  /** Moved above the seat card when one is open, and lifted by the dock. */
  readonly lift?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}

/** The bottom-centre region the card lives in; it never takes the touch. */
export function SeatLayerPickerToastLayer(props: SeatLayerPickerToastLayerProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  // The queue re-renders its owner through `useSeatLayerPickerToastQueue`; the
  // layer only draws whatever is up.
  const queue = props.queue;
  const toast = queue.current;
  // §2.4 — the toast's action is a 44 pt reach over the map; the runtime must
  // not route the press to a seat underneath it.
  const blocked = useSeatLayerPickerBlockedRegion(toast !== null);
  useEffect(() => {
    if (toast === null) return;
    // Announced outright as well as live: four seconds inside a cross-fade is
    // a window a live region cannot be relied on to catch.
    try { AccessibilityInfo.announceForAccessibility?.(toast.message); } catch { /* advisory */ }
  }, [toast?.id, toast?.message]);
  if (toast === null) return null;
  return (
    <View
      collapsable={false}
      onLayout={blocked.onLayout}
      pointerEvents="box-none"
      ref={blocked.ref as never}
      testID="seatlayer-picker-toast-layer"
      style={[{
        alignItems: 'center',
        bottom: props.lift ?? seatLayerToastCardLift,
        left: 0,
        paddingHorizontal: 16,
        position: 'absolute',
        right: 0,
      }, props.style]}
    >
      <SeatLayerPickerToastCard
        onAction={() => queue.press(toast.id)}
        theme={theme}
        toast={toast}
      />
      {props.children}
    </View>
  );
}

/** A scope-lived queue whose timer is the platform's, reset with the session. */
export function useSeatLayerPickerToastQueue(): Readonly<{
  queue: SeatLayerToastQueue;
  show: (request: SeatLayerToastRequest) => void;
}> {
  const scope = useSeatLayerPickerScope();
  const [, setVersion] = useState(0);
  const queue = useMemo(() => new SeatLayerToastQueue({
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }, () => setVersion((value) => value + 1)), []);
  useEffect(() => () => queue.dispose(), [queue]);
  useEffect(() => { queue.reset(); }, [queue, scope.controller, scope.sessionId]);
  return { queue, show: (request) => { queue.show(request); } };
}

/** The one toast the picker owns outright: an event that has stopped selling. */
export function seatLayerSalesClosedToast(
  strings: ReturnType<typeof useSeatLayerPickerScope>['strings'],
): SeatLayerToastRequest {
  return Object.freeze({ message: strings.translate('salesClosedToast'), tone: 'warning' as const });
}
