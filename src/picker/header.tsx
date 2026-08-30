import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Image,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import {
  resolveSeatLayerPickerMapChromeTheme,
  seatLayerPickerColorAlpha,
} from "./mapChromeTheme";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { supportsSeatLayerPickerNativeChrome } from "./surfaces";
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
  type SeatLayerPickerThemeStyles,
} from "./styles";
import type { SeatLayerPickerThemeData } from "./theme";
import { seatLayerPickerTokens } from "./tokens.g";

type HeaderSlots = Pick<
  SeatLayerPickerStyles,
  | "headerContainer"
  | "headerTitle"
  | "headerLogo"
  | "headerFallbackMark"
  | "holdPillContainer"
  | "holdPillText"
  | "headerAction"
>;

export interface SeatLayerPickerHeaderProps {
  readonly compact?: boolean;
  readonly onClose?: () => void | Promise<void>;
  readonly topInset?: number;
  /** Standalone headers do not reserve map space unless their layout owns it. */
  readonly reserveInset?: boolean;
  readonly showEventDetails?: boolean;
  readonly showHoldPill?: boolean;
  readonly options?: Readonly<
    { hideEventDetails?: boolean; showHoldPill?: boolean }
  >;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: HeaderSlots;
  readonly clock?: () => number;
  readonly holdRemainingLabel?: (remainingSeconds: number) => string;
  /** Undefined uses the built-in pill; null hides it; a node replaces it. */
  readonly holdCountdown?: ReactNode;
}

export interface SeatLayerPickerHeaderViewProps
  extends SeatLayerPickerHeaderProps {
  readonly title: string;
  readonly venue?: string;
  readonly logoSource?: ImageSourcePropType | string;
  readonly theme: SeatLayerPickerThemeData;
  readonly themeStyles?: SeatLayerPickerThemeStyles;
  readonly hold?: Readonly<{ active: boolean; expiresAt?: number }>;
  readonly holdLapsed?: boolean;
  readonly closeLabel: string;
  readonly heldFor: (clock: string) => string;
  readonly reportInset: (height: number) => void;
  readonly removeInset: () => void;
  readonly reportError: (error: unknown) => void;
  readonly sessionId?: number;
}

function boundedInset(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function safelyReport(
  callback: (error: unknown) => void,
  error: unknown,
): void {
  try {
    callback(error);
  } catch { /* Error reporting cannot create another host failure. */ }
}

function readClock(clock: () => number): number {
  const value = clock();
  if (!Number.isFinite(value)) throw new RangeError("Invalid picker clock");
  return value;
}

function FallbackMark({ background, foreground, size, style }: {
  readonly background: string;
  readonly foreground: string;
  readonly size: number;
  readonly style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  return (
    <View
      accessible={false}
      style={[styles.mark, {
        width: size,
        height: size,
        borderRadius: size < 30 ? 6 : 10,
        backgroundColor: background,
      }, style]}
    >
      <View style={[styles.markBack, { backgroundColor: foreground }]} />
      <View style={[styles.markBase, { backgroundColor: foreground }]} />
    </View>
  );
}

function ClosePaint({ color }: { readonly color: string }): React.ReactElement {
  return (
    <View accessible={false} style={styles.closeIcon}>
      <View
        style={[styles.closeStroke, {
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
        }]}
      />
      <View
        style={[styles.closeStroke, {
          backgroundColor: color,
          transform: [{ rotate: "-45deg" }],
        }]}
      />
    </View>
  );
}

/** Context-free header data view; the scoped wrapper only adapts picker scope. */
export function SeatLayerPickerHeaderView(
  props: SeatLayerPickerHeaderViewProps,
): React.ReactElement {
  const {
    clock = Date.now,
    compact = false,
    hold,
    holdLapsed = false,
    logoSource,
    onClose,
    options,
    reportError,
    reportInset,
    removeInset,
    showEventDetails = true,
    showHoldPill = true,
    style,
    theme,
    themeStyles,
    topInset,
  } = props;
  const asyncFailure = useRef<unknown>(undefined);
  const failureReported = useRef(false);
  const latestReportError = useRef(reportError);
  let renderFailure: unknown;
  const [, setFailureVersion] = useState(0);
  useLayoutEffect(() => { latestReportError.current = reportError; }, [reportError]);
  const [now, setNow] = useState(() => {
    try {
      return readClock(clock);
    } catch {
      return Date.now();
    }
  });
  const [failedLogo, setFailedLogo] = useState(false);
  const [closing, setClosing] = useState(false);
  const mounted = useRef(true);
  const closeFlight = useRef<number | undefined>(undefined);
  const insetLease = useRef(0);
  const currentSession = useRef(props.sessionId ?? 0);
  const sessionId = props.sessionId ?? 0;
  const logoSourceRef = useRef(logoSource);
  useLayoutEffect(() => {
    currentSession.current = sessionId;
    closeFlight.current = undefined;
    asyncFailure.current = undefined;
    failureReported.current = false;
    setClosing(false);
  }, [sessionId]);
  useLayoutEffect(() => {
    logoSourceRef.current = logoSource;
    setFailedLogo(false);
  }, [logoSource]);
  const captureAsyncFailure = useCallback((error: unknown, generation: number) => {
    if (!mounted.current || currentSession.current !== generation) return;
    if (asyncFailure.current !== undefined || failureReported.current) return;
    asyncFailure.current = error;
    setFailureVersion((value) => value + 1);
  }, []);
  const expiry = hold?.active === true && typeof hold.expiresAt === "number" &&
      Number.isFinite(hold.expiresAt)
    ? hold.expiresAt
    : undefined;
  const showHold = props.holdCountdown === undefined && expiry !== undefined && !holdLapsed && showHoldPill &&
    options?.showHoldPill !== false;
  const slots = resolveSeatLayerPickerStyles(themeStyles, props.slots);
  const safeStyle = sanitizeSeatLayerPickerStyle(style);
  useEffect(() => {
    try {
      setNow(readClock(clock));
    } catch (error) {
      captureAsyncFailure(error, sessionId);
    }
    if (!showHold) return undefined;
    const timer = setInterval(() => {
      try {
        setNow(readClock(clock));
      } catch (error) {
        captureAsyncFailure(error, sessionId);
      }
    }, 1_000);
    return () => clearInterval(timer);
  }, [captureAsyncFailure, clock, expiry, sessionId, showHold]);
  useEffect(() => {
    const error = asyncFailure.current ?? renderFailure;
    if (error !== undefined && !failureReported.current) {
      failureReported.current = true;
      safelyReport(reportError, error);
    }
  }, [renderFailure, reportError, sessionId]);
  const remaining = expiry === undefined
    ? 0
    : Math.max(0, Math.floor((expiry - now) / 1_000));
  const clockText = `${
    String(Math.floor(remaining / 60) % 60).padStart(2, "0")
  }:${String(remaining % 60).padStart(2, "0")}`;
  const captureRenderFailure = (error: unknown): void => {
    renderFailure ??= error;
  };
  let heldFor = clockText;
  let spoken = clockText;
  if (showHold) {
    try {
      const value = props.heldFor(clockText);
      if (typeof value === "string" && value.trim()) heldFor = value;
      else captureRenderFailure(new TypeError("Invalid hold formatter result"));
    } catch (error) {
      captureRenderFailure(error);
    }
    spoken = heldFor;
    if (props.holdRemainingLabel) {
      try {
        const value = props.holdRemainingLabel(remaining);
        if (typeof value === "string" && value.trim()) spoken = value;
        else captureRenderFailure(new TypeError("Invalid hold formatter result"));
      } catch (error) {
        captureRenderFailure(error);
      }
    }
  }
  const close = useCallback(() => {
    const session = sessionId;
    if (!onClose || currentSession.current !== session || closeFlight.current !== undefined) return;
    closeFlight.current = session;
    setClosing(true);
    try {
      void Promise.resolve(onClose()).catch((error) => {
        if (mounted.current && currentSession.current === session) safelyReport(reportError, error);
      }).finally(() => {
        if (
          closeFlight.current === session && currentSession.current === session
        ) {
          closeFlight.current = undefined;
          if (mounted.current) setClosing(false);
        }
      });
    } catch (error) {
      if (
        closeFlight.current === session && currentSession.current === session
      ) {
        closeFlight.current = undefined;
        if (mounted.current) setClosing(false);
      }
      if (mounted.current && currentSession.current === session) safelyReport(reportError, error);
    }
  }, [onClose, reportError, sessionId]);
  useLayoutEffect(() => {
    mounted.current = true;
    const lease = insetLease.current + 1;
    insetLease.current = lease;
    try { reportInset(seatLayerPickerTokens.size.headerHeight + boundedInset(topInset)); } catch (error) { safelyReport(reportError, error); }
    return () => {
      mounted.current = false;
    };
  }, [reportError, reportInset, sessionId, topInset]);
  useEffect(() => () => {
    const lease = insetLease.current;
    if (lease <= 0) return;
    try { removeInset(); } catch (error) { safelyReport(latestReportError.current, error); }
  }, [removeInset]);
  const showDetails = showEventDetails && options?.hideEventDetails !== true;
  const logo = failedLogo || !logoSource
    ? (
      <FallbackMark
        background={theme.colors.accent}
        foreground={theme.colors.onAccent}
        size={compact ? seatLayerPickerTokens.size.headerLogoSize : 36}
        style={slots.headerFallbackMark}
      />
    )
    : (
      <Image
        source={typeof logoSource === "string"
          ? { uri: logoSource }
          : logoSource}
        onError={() => {
          if (mounted.current && logoSourceRef.current === logoSource) {
            setFailedLogo(true);
          }
        }}
        resizeMode="contain"
        style={[{
          width: compact ? seatLayerPickerTokens.size.headerLogoSize : 36,
          height: compact ? seatLayerPickerTokens.size.headerLogoSize : 36,
          borderRadius: compact ? 6 : 10,
        }, slots.headerLogo, {
          width: compact ? seatLayerPickerTokens.size.headerLogoSize : 36,
          height: compact ? seatLayerPickerTokens.size.headerLogoSize : 36,
        }]}
      />
    );
  return (
    <View
      onLayout={(event: LayoutChangeEvent) => {
        if (!mounted.current || currentSession.current !== sessionId) return;
        try {
          reportInset(event.nativeEvent.layout.height);
        } catch (error) {
          safelyReport(reportError, error);
        }
      }}
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          paddingTop: boundedInset(topInset),
        },
        slots.headerContainer,
        safeStyle,
        {
          height: seatLayerPickerTokens.size.headerHeight + boundedInset(topInset),
          minHeight: seatLayerPickerTokens.size.headerHeight + boundedInset(topInset),
        },
      ]}
    >
      <View style={[styles.row, compact ? styles.compactRow : undefined]}>
        {logo}
        {showDetails
          ? (
            <View style={styles.titleWrap}>
              <Text
                numberOfLines={1}
                style={[compact ? styles.compactTitle : styles.title, {
                  color: theme.colors.text,
                  fontFamily: theme.fontFamily,
                }, slots.headerTitle]}
              >
                {props.title}
              </Text>
              {!compact && props.venue
                ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.venue, {
                      color: theme.colors.mutedText,
                      fontFamily: theme.fontFamily,
                    }]}
                  >
                    {props.venue}
                  </Text>
                )
                : null}
            </View>
          )
          : <View style={styles.titleWrap} />}
        {props.holdCountdown !== undefined
          ? props.holdCountdown
          : showHold ? (
            <View
              accessible
              accessibilityLabel={spoken}
              style={[styles.hold, {
                backgroundColor: seatLayerPickerColorAlpha(
                  theme.colors.accent,
                  .12,
                ),
              }, slots.holdPillContainer]}
            >
              <View
                accessible={false}
                style={[styles.timer, { borderColor: theme.colors.accent }]}
              >
                <View
                  style={[styles.timerHand, {
                    backgroundColor: theme.colors.accent,
                  }]}
                />
              </View>
              <Text
                style={[styles.holdText, {
                  color: theme.colors.text,
                  fontFamily: theme.fontFamily,
                }, slots.holdPillText]}
              >
                {heldFor}
              </Text>
            </View>
          ) : null}
        {onClose
          ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={props.closeLabel}
              accessibilityState={{
                busy: closing && closeFlight.current === sessionId,
                disabled: closing && closeFlight.current === sessionId,
              }}
              disabled={closing && closeFlight.current === sessionId}
              onPress={close}
              style={(
                { pressed },
              ) => [styles.closeHit, pressed ? styles.closePressed : undefined]}
            >
              <View
                style={[
                  styles.closePaint,
                  {
                    borderColor: theme.colors.divider,
                    backgroundColor: theme.colors.surface,
                    borderRadius: seatLayerPickerTokens.radius.button,
                  },
                  slots.headerAction,
                  {
                    width: 40,
                    height: 40,
                  },
                ]}
              >
                <ClosePaint color={theme.colors.text} />
              </View>
            </Pressable>
          )
          : null}
      </View>
    </View>
  );
}

export function SeatLayerPickerHeader(
  props: SeatLayerPickerHeaderProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const mapTheme = resolveSeatLayerPickerMapChromeTheme(
    scope.resolvedTheme,
    scope.snapshot,
  );
  const headerLease = useMemo(
    () => props.reserveInset ? scope.claimViewportInsetBand("header") : undefined,
    [props.reserveInset, scope.claimViewportInsetBand, scope.sessionId],
  );
  const reportInset = useCallback((height: number) => headerLease?.set({ top: height }), [headerLease]);
  const removeInset = useCallback(() => headerLease?.remove(), [headerLease]);
  if (!supportsSeatLayerPickerNativeChrome(scope.controller)) return null;
  return (
    <SeatLayerPickerHeaderView
      {...props}
      closeLabel={scope.strings.translate("close")}
      heldFor={(clock) =>
        scope.strings.translate("heldFor", { values: { clock } })}
      hold={scope.snapshot?.hold}
      holdLapsed={scope.holdLapsed}
      logoSource={mapTheme.logoSource}
      removeInset={removeInset}
      reportError={scope.reportError}
      reportInset={reportInset}
      sessionId={scope.sessionId}
      theme={mapTheme}
      themeStyles={scope.styles}
      title={scope.snapshot?.event.name ??
        scope.strings.translate("chooseSeats")}
      venue={scope.snapshot?.event.venue}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: seatLayerPickerTokens.size.headerHeight,
    justifyContent: "flex-end",
  },
  row: {
    minHeight: seatLayerPickerTokens.size.headerHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 16,
    paddingRight: 4,
  },
  compactRow: {
    height: seatLayerPickerTokens.size.headerHeight,
    gap: 10,
    paddingLeft: 12,
  },
  mark: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 5,
  },
  markBack: {
    width: 12,
    height: 9,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  markBase: { width: 17, height: 4, borderRadius: 2, marginTop: 2 },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "800" },
  compactTitle: { fontSize: 14, fontWeight: "800" },
  venue: { marginTop: 1, fontSize: 12 },
  hold: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: seatLayerPickerTokens.radius.pill,
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  timer: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    marginEnd: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  timerHand: { width: 1.5, height: 5, borderRadius: 1 },
  holdText: {
    fontSize: seatLayerPickerTokens.type.pill.size,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  closeHit: {
    width: seatLayerPickerTokens.size.minimumHitTarget,
    height: seatLayerPickerTokens.size.minimumHitTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  closePressed: { opacity: .72 },
  closePaint: {
    width: 40,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  closeStroke: { position: "absolute", width: 18, height: 2, borderRadius: 1 },
});
