import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import {
  reduceSeatLayerPickerReveal, seatLayerPickerAwaitingFraming,
  seatLayerPickerInitialRevealState, seatLayerPickerRevealed,
  seatLayerPickerRevealGraceMs,
} from "./chartBoot";
import { SeatLayerPickerLoadingSurface } from "./loadingSurface";
import type { SeatLayerPickerStringResolver } from "./locale";
import {
  resolveSeatLayerPickerMapChromeTheme,
} from "./mapChromeTheme";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
  type SeatLayerPickerThemeStyles,
} from "./styles";
import type { SeatLayerPickerThemeData } from "./theme";
import { seatLayerPickerTokens } from "./tokens.g";

export {
  SeatLayerPickerTestModeIndicator,
  SeatLayerPickerTestModeIndicatorView,
  type SeatLayerPickerTestModeIndicatorProps,
  type SeatLayerPickerTestModeIndicatorViewProps,
} from "./testModeIndicator";
import { seatLayerPickerBoldStyles } from './boldText';
import { seatLayerPickerOwnBuyerMessage } from './errorWords';
import { seatLayerPickerFailureKind } from './connectionMessages';
import { SeatLayerPickerConnectionSign } from './connectionSign';
import { useSeatLayerPickerOfflineRetries } from './offlineRetry';

type StatusSlots = Pick<
  SeatLayerPickerStyles,
  | "statusContainer"
  | "statusText"
  | "errorContainer"
  | "errorText"
  | "statusAction"
  | "statusActionText"
>;

export interface SeatLayerPickerBuyerError {
  readonly buyerMessage?: string;
}

function safelyReport(
  callback: ((error: unknown) => void) | undefined,
  error: unknown,
): void {
  try {
    callback?.(error);
  } catch { /* Reporting must not create a second failure. */ }
}
export interface SeatLayerPickerStatusProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: StatusSlots;
}
export interface SeatLayerPickerEmptyStatusProps extends SeatLayerPickerStatusProps {
  readonly message?: string;
}
interface StatusViewProps extends SeatLayerPickerStatusProps {
  readonly theme: SeatLayerPickerThemeData;
  readonly strings: SeatLayerPickerStringResolver;
  readonly themeStyles?: SeatLayerPickerThemeStyles;
}

/** How long an opening runs before the buyer is told it is taking longer. */
export const seatLayerPickerSlowOpeningMs = 8_000;

/** Context-free loading status. */
export function SeatLayerPickerLoadingStatus({
  theme,
  strings,
  slots: componentSlots,
  style,
  themeStyles,
  slow,
}: StatusViewProps & { readonly slow?: boolean }): React.ReactElement {
  // §4.7: the wait is the venue taking shape, not a spinner on a blank page.
  return (
    <SeatLayerPickerLoadingSurface
      slow={slow}
      slots={componentSlots}
      strings={strings}
      style={style}
      theme={theme}
      themeStyles={themeStyles}
    />
  );
}

export interface SeatLayerPickerLoadingViewProps extends SeatLayerPickerStatusProps {
  /**
   * §4.7 reveal-after-framing: true from the first viewport-inset report that
   * lands after the runtime is ready. Presentation only — the picker is fully
   * callable while it is false, and a 700 ms backstop reveals the map anyway
   * for a runtime that never answers.
   */
  readonly framed?: boolean;
}

export function SeatLayerPickerLoadingView(
  props: SeatLayerPickerLoadingViewProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const [reveal, dispatch] = useReducer(
    reduceSeatLayerPickerReveal, seatLayerPickerInitialRevealState,
  );
  const framed = props.framed ?? false;
  useEffect(() => { dispatch('reset'); }, [scope.controller, scope.sessionId]);
  // An opening that runs past 8 s says so.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (scope.isReady) return undefined;
    const handle = setTimeout(() => setSlow(true), seatLayerPickerSlowOpeningMs);
    return () => clearTimeout(handle);
  }, [scope.controller, scope.isReady, scope.sessionId]);
  useEffect(() => { if (scope.isReady) dispatch('ready'); }, [scope.isReady]);
  useEffect(() => { if (framed) dispatch('insetsReported'); }, [framed]);
  useEffect(() => {
    if (!seatLayerPickerAwaitingFraming(reveal)) return undefined;
    const handle = setTimeout(() => dispatch('graceLapsed'), seatLayerPickerRevealGraceMs);
    return () => clearTimeout(handle);
  }, [reveal]);
  if (scope.isReady && seatLayerPickerRevealed(reveal)) return null;
  const theme = resolveSeatLayerPickerMapChromeTheme(
    scope.resolvedTheme,
    scope.snapshot,
  );
  return (
    <SeatLayerPickerLoadingStatus
      slow={slow}
      slots={props.slots}
      style={props.style}
      theme={theme}
      themeStyles={scope.styles}
      strings={scope.strings}
    />
  );
}

/** Context-free empty-inventory status with host-replaceable copy. */
export function SeatLayerPickerEmptyStatus({
  message,
  slots: componentSlots,
  strings,
  style,
  theme,
  themeStyles,
}: StatusViewProps & SeatLayerPickerEmptyStatusProps): React.ReactElement {
  const slots = resolveSeatLayerPickerStyles(themeStyles, componentSlots);
  const copy = typeof message === 'string' && message.trim()
    ? message.trim()
    : strings.translate("noSelectableSeats");
  return <View
    accessibilityLiveRegion="polite"
    style={[styles.root, slots.statusContainer, sanitizeSeatLayerPickerStyle(style)]}
  >
    <View accessible={false} style={[styles.emptyMark, { borderColor: theme.colors.mutedText }]}>
      <View style={[styles.emptySeatBack, { borderColor: theme.colors.mutedText }]} />
      <View style={[styles.emptySeatBase, { backgroundColor: theme.colors.mutedText }]} />
    </View>
    <Text style={[styles.text, {
      color: theme.colors.text,
      fontFamily: theme.fontFamily,
    }, slots.statusText]}>{copy}</Text>
  </View>;
}

/** Scoped standalone empty view for custom layouts and the proven-empty ready-made state. */
export function SeatLayerPickerEmptyView(
  props: SeatLayerPickerEmptyStatusProps,
): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  return <SeatLayerPickerEmptyStatus
    {...props}
    strings={scope.strings}
    theme={theme}
    themeStyles={scope.styles}
  />;
}

export interface SeatLayerPickerErrorStatusProps extends StatusViewProps {
  readonly error?: SeatLayerPickerBuyerError | Error | unknown;
  readonly retry?: () => void | Promise<void>;
  readonly onActionError?: (error: unknown) => void;
  readonly sessionId?: number;
  /** Whose tries the offline panel counts: the picker it opens again. */
  readonly retryOwner?: object;
}
/** Context-free error status. No retry affordance exists without a real action. */
export function SeatLayerPickerErrorStatus({
  error,
  onActionError,
  retry,
  slots: componentSlots,
  strings,
  style,
  theme,
  themeStyles,
  sessionId = 0,
  retryOwner,
}: SeatLayerPickerErrorStatusProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const lease = useRef<{
    readonly sessionId: number;
    readonly retry: (() => void | Promise<void>) | undefined;
    readonly onActionError: ((error: unknown) => void) | undefined;
  } | undefined>(undefined);
  const flight = useRef<object | undefined>(undefined);
  const renderedLease = useMemo(
    () => ({ sessionId, retry, onActionError }),
    [onActionError, retry, sessionId],
  );
  useLayoutEffect(() => {
    lease.current = renderedLease;
    flight.current = undefined;
    setBusy(false);
  }, [renderedLease]);
  const slots = resolveSeatLayerPickerStyles(themeStyles, componentSlots);
  const safeStyle = sanitizeSeatLayerPickerStyle(style);
  const retryBusy = busy && flight.current !== undefined;
  const runRetry = useCallback(() => {
    if (lease.current !== renderedLease || renderedLease.retry === undefined || flight.current !== undefined) return;
    const token = {};
    flight.current = token;
    setBusy(true);
    try {
      void Promise.resolve(renderedLease.retry()).then(
        undefined,
        (nextError) => {
          if (mounted.current && lease.current === renderedLease && flight.current === token) {
            safelyReport(renderedLease.onActionError, nextError);
          }
        },
      ).finally(() => {
        if (flight.current === token) {
          flight.current = undefined;
          if (mounted.current && lease.current === renderedLease) setBusy(false);
        }
      });
    } catch (nextError) {
      if (flight.current === token) flight.current = undefined;
      if (mounted.current && lease.current === renderedLease) {
        safelyReport(renderedLease.onActionError, nextError);
        if (mounted.current) setBusy(false);
      }
    }
  }, [renderedLease]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Nothing answered: the buyer is offline, and the page is opened again by
  // itself. A server that answered with a fault says nothing of a connection.
  const kind = seatLayerPickerFailureKind(error);
  const offline = kind === "connection";
  useSeatLayerPickerOfflineRetries(retryOwner, offline && retry !== undefined, runRetry);
  const title = strings.translate(offline ? "offline" : "mapDidNotLoad");
  // What the app says itself stands under the title, unless it is the title.
  const own = offline ? undefined : [seatLayerPickerOwnBuyerMessage(error), strings.translate("errorMessage")]
    .find((sentence) => sentence !== undefined && sentence !== title);
  const palette = theme.themeMode === "dark" ? seatLayerPickerTokens.color.dark : seatLayerPickerTokens.color.light;
  const line = [
    styles.line,
    { color: theme.colors.mutedText, fontFamily: theme.fontFamily },
    slots.statusText,
  ];
  return (
    <View
      accessibilityRole="none"
      style={[styles.root, styles.failure, slots.statusContainer, slots.errorContainer, safeStyle]}
    >
      {offline ? <View style={[styles.offlineSign, { borderColor: theme.colors.divider }]}>
        <SeatLayerPickerConnectionSign color={palette.connectionLost} shown="offline" size={24} />
      </View> : null}
      <Text accessibilityRole="alert"
        style={[
          styles.title,
          { color: theme.colors.text, fontFamily: theme.fontFamily },
          slots.statusText,
          slots.errorText,
        ]}
      >
        {title}
      </Text>
      {own === undefined ? null : <Text style={line}>{own}</Text>}
      {kind === "server" ? null : <Text style={line}>{strings.translate("checkConnection")}</Text>}
      {retry === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.translate("retry")}
          accessibilityState={{ busy: retryBusy, disabled: retryBusy }}
          disabled={retryBusy}
          onPress={runRetry}
          style={({ pressed }) => [
            styles.retry,
            {
              backgroundColor: theme.colors.accent,
              borderRadius: seatLayerPickerTokens.radius.button,
              opacity: pressed ? 0.85 : 1,
            },
            slots.statusAction,
          ]}
        >
          <Text
            style={[styles.retryText, {
              color: theme.colors.onAccent,
              fontFamily: theme.fontFamily,
            }, slots.statusActionText]}
          >
            {retryBusy ? strings.translate("loading") : strings.translate("retry")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
/** Scoped error status defaults to the controller's real runtime reload. */
export function SeatLayerPickerErrorView(
  props: SeatLayerPickerStatusProps & {
    readonly retry?: () => void | Promise<void>;
    readonly error?: SeatLayerPickerBuyerError | Error | unknown;
  },
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  // A ready picker owns recoverable command errors inline. This surface is
  // deliberately reserved for failures before the picker becomes usable.
  const actualError = props.error ?? (scope.isReady ? undefined : scope.error);
  if (actualError === undefined) return null;
  const theme = resolveSeatLayerPickerMapChromeTheme(
    scope.resolvedTheme,
    scope.snapshot,
  );
  return (
    <SeatLayerPickerErrorStatus
      {...props}
      error={actualError}
      onActionError={scope.reportError}
      retry={props.retry ?? scope.retry}
      retryOwner={scope.controller}
      sessionId={scope.sessionId}
      strings={scope.strings}
      theme={theme}
      themeStyles={scope.styles}
    />
  );
}

const styles = seatLayerPickerBoldStyles(StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 28,
  },
  text: { textAlign: "center", fontSize: 15, lineHeight: 22 },
  failure: { gap: 10 },
  // Full width: Android measures a heavy title narrower than it draws it, and
  // a word that wraps past the measured line is not drawn.
  title: { alignSelf: "stretch", textAlign: "center", fontSize: 15, fontWeight: "800", lineHeight: 20 },
  line: { textAlign: "center", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  emptyMark: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'flex-end',
    width: 44,
  },
  emptySeatBack: {
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 2,
    height: 22,
    width: 28,
  },
  emptySeatBase: { borderRadius: 2, height: 4, marginTop: 4, width: 36 },
  offlineSign: {
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    marginBottom: 4,
    width: 56,
  },
  retry: {
    minHeight: 44,
    marginTop: 6,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontSize: 13, fontWeight: "700" },
}));
