import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

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
  readonly holdRemainingLabel?: (remainingSeconds: number) => string;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: HoldSlots;
}

export interface SeatLayerPickerHoldCountdownViewProps extends SeatLayerPickerHoldCountdownProps {
  readonly heldFor: (clock: string) => string;
  readonly hold?: Readonly<{ active: boolean; expiresAt?: number }>;
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
  const expiry = hold?.active === true && typeof hold.expiresAt === 'number' &&
      Number.isFinite(hold.expiresAt)
    ? hold.expiresAt
    : undefined;
  const visible = expiry !== undefined && !holdLapsed;
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
    const timer = setInterval(tick, 1_000);
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
  const clockText = `${String(Math.floor(remaining / 60) % 60).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
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
    if (holdRemainingLabel) {
      try {
        const value = holdRemainingLabel(remaining);
        if (typeof value === 'string' && value.trim()) spoken = value;
        else throw new TypeError('Invalid hold formatter result');
      } catch (nextError) {
        error ??= nextError;
      }
    }
    return Object.freeze({ label, spoken, error });
  }, [clockText, heldFor, holdRemainingLabel, remaining, visible]);
  useEffect(() => {
    if (formatted.error === undefined || reported.current.formatter === sessionId) return;
    reported.current = Object.freeze({ ...reported.current, formatter: sessionId });
    report(reportError, formatted.error);
  }, [formatted.error, reportError, sessionId]);
  if (!visible) return null;
  return <View
    accessible
    accessibilityLabel={formatted.spoken}
    style={[nativeStyles.hold, {
      backgroundColor: seatLayerPickerColorAlpha(theme.colors.accent, .12),
    }, slots.holdPillContainer, sanitizeSeatLayerPickerStyle(style)]}
  >
    <View accessible={false} style={[nativeStyles.timer, { borderColor: theme.colors.accent }]}>
      <View style={[nativeStyles.timerHand, { backgroundColor: theme.colors.accent }]} />
    </View>
    <Text style={[nativeStyles.holdText, {
      color: theme.colors.text,
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
    height: 30,
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
