import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  seatLayerHoldAnnouncementFor,
  seatLayerHoldClockText,
  seatLayerHoldExpiring,
  seatLayerHoldPillDrawn,
} from './holdCountdownAnnounce';
import { resolveSeatLayerPickerMapChromeTheme, seatLayerPickerColorAlpha } from './mapChromeTheme';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
  type SeatLayerPickerThemeStyles,
} from './styles';
import type { SeatLayerPickerThemeData } from './theme';
import { seatLayerPickerTokens } from './tokens.g';

type HoldSlots = Pick<SeatLayerPickerStyles, 'holdPillContainer' | 'holdPillText'>;

export interface SeatLayerPickerHoldCountdownProps {
  readonly clock?: () => number;
  /** The throttled sentence a screen reader hears; §4.10. */
  readonly announceHold?: (key: 'holdMinutesLeft' | 'holdSecondsLeft', count: number) => string;
  readonly holdRemainingLabel?: (remainingSeconds: number) => string;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: HoldSlots;
}

export interface SeatLayerPickerHoldCountdownViewProps extends SeatLayerPickerHoldCountdownProps {
  readonly heldFor: (clock: string) => string;
  readonly hold?: Readonly<{ active: boolean; expiresAt?: number; owner?: string }>;
  readonly holdLapsed?: boolean;
  readonly reportError?: (error: unknown) => void;
  readonly sessionId?: number;
  readonly theme: SeatLayerPickerThemeData;
  readonly themeStyles?: SeatLayerPickerThemeStyles;
}

function readClock(clock: () => number): number {
  const value = clock();
  if (!Number.isFinite(value)) throw new RangeError('Invalid picker clock');
  return value;
}

function report(callback: ((error: unknown) => void) | undefined, error: unknown): void {
  try { callback?.(error); } catch { /* Observation cannot break the countdown. */ }
}

/** Context-free hold countdown. It owns no header layout and renders only for a live hold. */
export function SeatLayerPickerHoldCountdownView(
  props: SeatLayerPickerHoldCountdownViewProps,
): React.ReactElement | null {
  const {
    clock = Date.now,
    heldFor,
    hold,
    holdLapsed = false,
    holdRemainingLabel,
    reportError,
    sessionId = 0,
    style,
    theme,
    themeStyles,
  } = props;
  // §4.8: a hold handed to the host is the host's to display.
  const visible = seatLayerHoldPillDrawn(hold, holdLapsed);
  const expiry = visible ? hold!.expiresAt! : undefined;
  const [now, setNow] = useState(Date.now);
  const reported = useRef<Readonly<{ clock?: number; formatter?: number }>>({});
  const [failure, setFailure] = useState<unknown>(undefined);
  useEffect(() => {
    setFailure(undefined);
    reported.current = {};
  }, [sessionId]);
  useEffect(() => {
    if (!visible) return undefined;
    const tick = () => {
      try { setNow(readClock(clock)); } catch (error) { setFailure((current: unknown) => current ?? error); }
    };
    tick();
    // Twice a second so a second never appears to skip (§3.13.6).
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [clock, expiry, sessionId, visible]);
  useEffect(() => {
    if (failure === undefined || reported.current.clock === sessionId) return;
    reported.current = Object.freeze({ ...reported.current, clock: sessionId });
    report(reportError, failure);
  }, [failure, reportError, sessionId]);
  const slots = useMemo(
    () => resolveSeatLayerPickerStyles(themeStyles, props.slots),
    [props.slots, themeStyles],
  );
  const remaining = expiry === undefined ? 0 : Math.max(0, Math.floor((expiry - now) / 1_000));
  const clockText = seatLayerHoldClockText(remaining);
  const expiring = visible && seatLayerHoldExpiring(remaining);
  const formatted = useMemo(() => {
    if (!visible) return Object.freeze({ label: clockText, spoken: clockText, error: undefined });
    let label = clockText;
    let spoken = clockText;
    let error: unknown;
    try {
      const value = heldFor(clockText);
      if (typeof value === 'string' && value.trim()) label = value;
      else throw new TypeError('Invalid hold formatter result');
    } catch (nextError) {
      error = nextError;
    }
    spoken = label;
    // The countdown is throttled: on the minute, then every second of the last
    // minute. Unchanged text is not re-announced, so the throttle IS the policy.
    const announcement = seatLayerHoldAnnouncementFor(remaining);
    if (announcement !== null && props.announceHold) {
      try {
        const value = props.announceHold(announcement.key, announcement.count);
        if (typeof value === 'string' && value.trim()) spoken = value;
      } catch (nextError) {
        error ??= nextError;
      }
    } else if (announcement !== null && holdRemainingLabel) {
      try {
        const value = holdRemainingLabel(remaining);
        if (typeof value === 'string' && value.trim()) spoken = value;
        else throw new TypeError('Invalid hold formatter result');
      } catch (nextError) {
        error ??= nextError;
      }
    }
    return Object.freeze({ label, spoken, error });
  }, [clockText, heldFor, holdRemainingLabel, props.announceHold, remaining, visible]);
  const lastSpoken = useRef<string | undefined>(undefined);
  if (formatted.spoken !== clockText) lastSpoken.current = formatted.spoken;
  useEffect(() => {
    if (formatted.error === undefined || reported.current.formatter === sessionId) return;
    reported.current = Object.freeze({ ...reported.current, formatter: sessionId });
    report(reportError, formatted.error);
  }, [formatted.error, reportError, sessionId]);
  if (!visible) return null;
  return <View
    accessible
    accessibilityLiveRegion="polite"
    accessibilityLabel={lastSpoken.current ?? formatted.spoken}
    testID="seatlayer-hold-countdown"
    style={[nativeStyles.hold, {
      // Resting is the accent mixed lightly into the surface with accent-toned
      // ink; expiring inverts to the full accent.
      backgroundColor: expiring ? theme.colors.accent : seatLayerPickerColorAlpha(theme.colors.accent, .12),
    }, slots.holdPillContainer, sanitizeSeatLayerPickerStyle(style)]}
  >
    <View accessible={false} style={[nativeStyles.timer, {
      borderColor: expiring ? theme.colors.onAccent : theme.colors.accent,
    }]}>
      <View style={[nativeStyles.timerHand, {
        backgroundColor: expiring ? theme.colors.onAccent : theme.colors.accent,
      }]} />
    </View>
    <Text style={[nativeStyles.holdText, {
      color: expiring ? theme.colors.onAccent : theme.colors.accent,
      fontFamily: theme.fontFamily,
    }, slots.holdPillText]}>{formatted.label}</Text>
  </View>;
}

/** Scoped standalone hold countdown for custom picker compositions. */
export function SeatLayerPickerHoldCountdown(
  props: SeatLayerPickerHoldCountdownProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  return <SeatLayerPickerHoldCountdownView
    {...props}
    announceHold={(key, count) => scope.strings.translate(key, { count, values: { count } })}
    heldFor={(clock) => scope.strings.translate('heldFor', { values: { clock } })}
    hold={scope.snapshot?.hold}
    holdLapsed={scope.holdLapsed}
    reportError={scope.reportError}
    sessionId={scope.sessionId}
    theme={theme}
    themeStyles={scope.styles}
  />;
}

const nativeStyles = StyleSheet.create({
  hold: {
    alignItems: 'center',
    borderRadius: seatLayerPickerTokens.radius.pill,
    flexDirection: 'row',
    height: seatLayerPickerTokens.size.headerCloseSize,
    minHeight: seatLayerPickerTokens.size.headerCloseSize,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  timer: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 1.5,
    height: 13,
    justifyContent: 'center',
    marginEnd: 5,
    width: 13,
  },
  timerHand: { borderRadius: 1, height: 5, width: 1.5 },
  holdText: {
    fontSize: seatLayerPickerTokens.type.pill.size,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
});
