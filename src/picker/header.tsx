import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
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

import { seatLayerHeaderInitial } from "./headerIdentity";
import {
  seatLayerHoldAnnouncementFor,
  seatLayerHoldClockText,
  seatLayerHoldExpiring,
  seatLayerHoldPillDrawn,
} from "./holdCountdownAnnounce";
import {
  resolveSeatLayerPickerMapChromeTheme,
  seatLayerPickerColorAlpha,
} from "./mapChromeTheme";
import { resolveSeatLayerPickerMotion } from "./motion";
import { useSeatLayerPickerReducedMotion } from "./reducedMotion";
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
  readonly brandName?: string;
  readonly logoSource?: ImageSourcePropType | string;
  readonly theme: SeatLayerPickerThemeData;
  readonly themeStyles?: SeatLayerPickerThemeStyles;
  readonly hold?: Readonly<{ active: boolean; expiresAt?: number; owner?: string }>;
  readonly holdLapsed?: boolean;
  readonly salesClosed?: boolean;
  readonly closeLabel: string;
  readonly salesClosedLabel?: string;
  readonly heldFor: (clock: string) => string;
  /** The throttled sentence a screen reader hears; §4.10. */
  readonly announceHold?: (
    key: "holdMinutesLeft" | "holdSecondsLeft",
    count: number,
  ) => string;
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

function LetterMark({ background, foreground, fontFamily, letter, size, style }: {
  readonly background: string;
  readonly foreground: string;
  readonly fontFamily?: string;
  readonly letter: string;
  readonly size: number;
  readonly style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  return (
    <View
      accessible={false}
      style={[styles.mark, {
        width: size,
        height: size,
        borderRadius: seatLayerPickerTokens.radius.headerLogo,
        backgroundColor: background,
      }, style]}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: foreground,
          fontFamily,
          fontSize: Math.round(size * .55),
          fontWeight: "800",
        }}
      >
        {letter}
      </Text>
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
  const reducedMotion = useSeatLayerPickerReducedMotion();
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
  // The pill is the picker's one clock and is drawn for as long as the hold
  // lives (owner call, 2026-09-05); a hold handed to the host is the host's to
  // display (§4.8).
  const pillOwned = seatLayerHoldPillDrawn(hold, holdLapsed);
  const expiry = pillOwned ? hold!.expiresAt! : undefined;
  const showHold = props.holdCountdown === undefined && pillOwned && showHoldPill &&
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
    // Twice a second so a second never appears to skip (§3.13.6).
    const timer = setInterval(() => {
      try {
        setNow(readClock(clock));
      } catch (error) {
        captureAsyncFailure(error, sessionId);
      }
    }, 500);
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
  const clockText = seatLayerHoldClockText(remaining);
  const expiring = showHold && seatLayerHoldExpiring(remaining);
  const captureRenderFailure = (error: unknown): void => {
    renderFailure ??= error;
  };
  let heldFor = clockText;
  if (showHold) {
    try {
      const value = props.heldFor(clockText);
      if (typeof value === "string" && value.trim()) heldFor = value;
      else captureRenderFailure(new TypeError("Invalid hold formatter result"));
    } catch (error) {
      captureRenderFailure(error);
    }
  }
  // The countdown is throttled: on the minute, then every second of the last
  // minute. Unchanged text is not re-announced, so the throttle IS the policy.
  const spoken = useMemo(() => {
    if (!showHold) return undefined;
    const announcement = seatLayerHoldAnnouncementFor(remaining);
    if (announcement === null) return undefined;
    if (props.announceHold) {
      try {
        const value = props.announceHold(announcement.key, announcement.count);
        if (typeof value === "string" && value.trim()) return value;
      } catch { /* the pill still draws its clock */ }
    }
    if (props.holdRemainingLabel) {
      try {
        const value = props.holdRemainingLabel(remaining);
        if (typeof value === "string" && value.trim()) return value;
      } catch { /* the pill still draws its clock */ }
    }
    return undefined;
  }, [props.announceHold, props.holdRemainingLabel, remaining, showHold]);
  const spokenRef = useRef<string | undefined>(undefined);
  if (spoken !== undefined) spokenRef.current = spoken;
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
  const logoSize = seatLayerPickerTokens.size.headerLogoSize;
  const logo = failedLogo || !logoSource
    ? (
      <LetterMark
        background={theme.colors.accent}
        foreground={theme.colors.onAccent}
        fontFamily={theme.fontFamily}
        letter={seatLayerHeaderInitial(props.brandName, props.title)}
        size={logoSize}
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
        // The mark is a filled square carrying the organizer's logo.
        resizeMode="cover"
        style={[{
          width: logoSize,
          height: logoSize,
          borderRadius: seatLayerPickerTokens.radius.headerLogo,
          backgroundColor: theme.colors.accent,
        }, slots.headerLogo, { width: logoSize, height: logoSize }]}
      />
    );
  const headerHeight = seatLayerPickerTokens.size.headerHeight + boundedInset(topInset);
  // The picker's own ground, through the header's own style slot: a ground and
  // the ink on it must be resolved as a PAIR, or a host that darkened
  // `color.*.background` for the map leaves the event name unreadable.
  const ground = {
    background: theme.roles?.header?.background ?? theme.colors.surface,
    foreground: theme.roles?.header?.foreground ?? theme.colors.text,
    border: theme.roles?.header?.border ?? theme.colors.divider,
  };
  return (
    <View
      accessibilityRole="header"
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
          backgroundColor: ground.background,
          // A hairline of the divider under it.
          borderBottomColor: ground.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
          paddingTop: boundedInset(topInset),
        },
        slots.headerContainer,
        safeStyle,
        { height: headerHeight, minHeight: headerHeight },
      ]}
    >
      <View style={styles.row}>
        {logo}
        {showDetails
          ? (
            <View style={styles.titleWrap}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.title, {
                  color: ground.foreground,
                  fontFamily: theme.fontFamily,
                }, slots.headerTitle]}
              >
                {props.title}
              </Text>
            </View>
          )
          : <View style={styles.titleWrap} />}
        {props.holdCountdown !== undefined
          ? props.holdCountdown
          : showHold ? (
            <View
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={spokenRef.current ?? heldFor}
              testID="seatlayer-header-hold-pill"
              style={[styles.pill, {
                backgroundColor: expiring
                  ? theme.colors.accent
                  : seatLayerPickerColorAlpha(theme.colors.accent, .12),
              }, slots.holdPillContainer]}
            >
              <HoldDot
                color={expiring ? theme.colors.onAccent : theme.colors.accent}
                pulsing={expiring && !reducedMotion}
              />
              <Text
                allowFontScaling={false}
                style={[styles.pillText, {
                  color: expiring ? theme.colors.onAccent : theme.colors.accent,
                  fontFamily: theme.fontFamily,
                }, slots.holdPillText]}
              >
                {heldFor}
              </Text>
            </View>
          ) : null}
        {props.salesClosed === true && props.salesClosedLabel
          ? (
            <View
              accessible
              testID="seatlayer-header-sales-closed-pill"
              style={[styles.pill, {
                backgroundColor: seatLayerPickerColorAlpha(ground.foreground, .08),
              }]}
              accessibilityLabel={props.salesClosedLabel}
            >
              <Text
                accessible={false}
                allowFontScaling={false}
                style={[styles.pillText, {
                  color: ground.foreground,
                  fontFamily: theme.fontFamily,
                  marginEnd: 4,
                }]}
              >
                {"\u{1F512}"}
              </Text>
              <Text
                accessible={false}
                allowFontScaling={false}
                numberOfLines={1}
                style={[styles.pillText, {
                  color: ground.foreground,
                  fontFamily: theme.fontFamily,
                }]}
              >
                {props.salesClosedLabel}
              </Text>
            </View>
          )
          : null}
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
              testID="seatlayer-header-close"
              style={(
                { pressed },
              ) => [styles.closeHit, pressed ? styles.closePressed : undefined]}
            >
              <View
                style={[
                  styles.closePaint,
                  {
                    borderColor: ground.border,
                    backgroundColor: "transparent",
                  },
                  slots.headerAction,
                  {
                    width: seatLayerPickerTokens.size.headerCloseSize,
                    height: seatLayerPickerTokens.size.headerCloseSize,
                    borderRadius: seatLayerPickerTokens.radius.pill,
                  },
                ]}
              >
                <ClosePaint color={theme.colors.mutedText} />
              </View>
            </Pressable>
          )
          : null}
      </View>
    </View>
  );
}

/** The expiring dot's slow infinite breath; skipped under reduced motion. */
function HoldDot({ color, pulsing }: {
  readonly color: string;
  readonly pulsing: boolean;
}): React.ReactElement {
  const breath = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    breath.stopAnimation();
    if (!pulsing) {
      breath.setValue(1);
      return undefined;
    }
    const duration = seatLayerPickerTokens.motion.durationOutsideBudget.inviteBreathe;
    const [x1, y1, x2, y2] = resolveSeatLayerPickerMotion("enter", false).curve.cubicBezier;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { duration: duration / 2, easing: Easing.bezier(x1, y1, x2, y2), toValue: .35, useNativeDriver: true }),
      Animated.timing(breath, { duration: duration / 2, easing: Easing.bezier(x1, y1, x2, y2), toValue: 1, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [breath, pulsing]);
  return (
    <Animated.View
      accessible={false}
      style={[styles.dot, { backgroundColor: color, opacity: breath }]}
    />
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
      announceHold={(key, count) =>
        scope.strings.translate(key, { count, values: { count } })}
      brandName={scope.snapshot?.branding.brandName}
      closeLabel={scope.strings.translate("close")}
      heldFor={(clock) =>
        scope.strings.translate("heldFor", { values: { clock } })}
      hold={scope.snapshot?.hold}
      holdLapsed={scope.holdLapsed}
      logoSource={mapTheme.logoSource}
      removeInset={removeInset}
      reportError={scope.reportError}
      reportInset={reportInset}
      salesClosed={scope.snapshot?.event.salesClosed === true}
      salesClosedLabel={scope.strings.translate("salesClosedPill")}
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
    height: seatLayerPickerTokens.size.headerHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
  },
  mark: { alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, minWidth: 0 },
  title: {
    fontSize: seatLayerPickerTokens.size.headerNameFontSize,
    fontWeight: "800",
  },
  pill: {
    height: seatLayerPickerTokens.size.headerCloseSize,
    minHeight: seatLayerPickerTokens.size.headerCloseSize,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: seatLayerPickerTokens.radius.pill,
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginEnd: 5 },
  pillText: {
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
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  closeStroke: { position: "absolute", width: 12, height: 1.5, borderRadius: 1 },
});
