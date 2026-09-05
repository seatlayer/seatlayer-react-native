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
function safeBuyerMessage(value: unknown): string | undefined {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "buyerMessage");
    const message = descriptor?.enumerable && "value" in descriptor
      ? descriptor.value
      : undefined;
    return typeof message === "string" && message.trim() ? message.trim() : undefined;
  } catch {
    return undefined;
  }
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

/** Context-free loading status. */
export function SeatLayerPickerLoadingStatus({
  theme,
  strings,
  slots: componentSlots,
  style,
  themeStyles,
}: StatusViewProps): React.ReactElement {
  // §4.7: the wait is the venue taking shape, not a spinner on a blank page.
  return (
    <SeatLayerPickerLoadingSurface
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
  style,
  theme,
  themeStyles,
}: StatusViewProps & SeatLayerPickerEmptyStatusProps): React.ReactElement {
  const slots = resolveSeatLayerPickerStyles(themeStyles, componentSlots);
  const copy = typeof message === 'string' && message.trim()
    ? message.trim()
    : 'No selectable seats are currently available.';
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
  const message = safeBuyerMessage(error) ?? strings.translate("errorMessage");
  return (
    <View
      accessibilityRole="none"
      style={[styles.root, slots.statusContainer, slots.errorContainer, safeStyle]}
    >
      <View
        accessible={false}
        style={styles.errorMark}
      >
        <View style={[styles.cloudPuffSmall, { backgroundColor: theme.colors.mutedText }]} />
        <View style={[styles.cloudPuffLarge, { backgroundColor: theme.colors.mutedText }]} />
        <View style={[styles.cloudBase, { backgroundColor: theme.colors.mutedText }]} />
        <View
          style={[styles.errorLine, { backgroundColor: theme.colors.mutedText }]}
        />
      </View>
      <Text accessibilityRole="alert"
        style={[
          styles.text,
          { color: theme.colors.text, fontFamily: theme.fontFamily },
          slots.statusText,
          slots.errorText,
        ]}
      >
        {message}
      </Text>
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
              borderColor: theme.colors.divider,
              backgroundColor: pressed
                ? theme.colors.surface
                : theme.colors.background,
              borderRadius: seatLayerPickerTokens.radius.button,
            },
            slots.statusAction,
          ]}
        >
          <Text
            style={[styles.retryText, {
              color: theme.colors.text,
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
      sessionId={scope.sessionId}
      strings={scope.strings}
      theme={theme}
      themeStyles={scope.styles}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 28,
  },
  text: { textAlign: "center", fontSize: 15, lineHeight: 22 },
  errorMark: {
    width: 40,
    height: 40,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  cloudPuffSmall: {
    position: "absolute",
    left: 8,
    top: 15,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  cloudPuffLarge: {
    position: "absolute",
    left: 16,
    top: 10,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  cloudBase: {
    position: "absolute",
    left: 7,
    bottom: 8,
    width: 27,
    height: 12,
    borderRadius: 7,
  },
  errorLine: {
    position: "absolute",
    width: 42,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: "-35deg" }],
  },
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
  retry: {
    minWidth: 128,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontSize: 15, fontWeight: "800" },
});
