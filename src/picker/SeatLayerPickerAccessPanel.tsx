import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, View, type ViewStyle,
} from "react-native";

import { seatLayerPickerAccessPanel } from "./buyerStates";
import { seatLayerPickerColorAlpha } from "./colors";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { seatLayerPickerStateScaleClamp } from "./SeatLayerPickerStateOverlays";
import { sanitizeSeatLayerPickerStyle } from "./styles";
import { seatLayerPickerTokens } from "./tokens.g";
import { seatLayerPickerBoldStyles } from './boldText';

const size = seatLayerPickerTokens.size;
const radius = seatLayerPickerTokens.radius;

export interface SeatLayerPickerAccessPanelProps {
  readonly style?: StyleProp<ViewStyle>;
  /**
   * True when the host passed `onAccessUnavailable`. It has been told already
   * and may be running its own recovery, so the panel never remounts the
   * runtime under it — a failed refresh simply shows this panel again.
   */
  readonly hostOwnsRecovery?: boolean;
}

/**
 * §3.13.3. A veiled overlay over the whole picker, with EXACTLY ONE action per
 * reason. `accessRefresh` is its own word, not `strings.retry`: that one is the
 * paused screen's "Try again", and one string cannot carry two verbs.
 */
export function SeatLayerPickerAccessPanel(
  props: SeatLayerPickerAccessPanelProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const [busy, setBusy] = useState(false);
  const state = seatLayerPickerAccessPanel(scope.snapshot);
  const recover = useCallback(() => {
    if (state === undefined) return;
    setBusy(true);
    const done = () => setBusy(false);
    if (state.recovery === 'retry') {
      void scope.retry().then(done, (error: unknown) => {
        done();
        scope.reportError(error);
      });
      return;
    }
    // In place first, always: re-bootstrap the session and re-read the chart
    // through the live runtime, so the map never goes away and the buyer keeps
    // their camera and their picks.
    void scope.controller.mapController.refreshAccess().then(
      (refreshed) => {
        if (refreshed || props.hostOwnsRecovery === true) {
          done();
          return;
        }
        void scope.retry().then(done, (error: unknown) => {
          done();
          scope.reportError(error);
        });
      },
      (error: unknown) => {
        done();
        scope.reportError(error);
      },
    );
  }, [props.hostOwnsRecovery, scope, state]);
  if (state === undefined) return null;
  const theme = scope.resolvedTheme;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.veil,
        { backgroundColor: seatLayerPickerColorAlpha(theme.colors.background, .88) },
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
    >
      <View
        style={[styles.card, {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.divider,
          borderRadius: radius.base,
        }]}
      >
        <View
          accessible={false}
          style={[styles.icon, {
            backgroundColor: seatLayerPickerColorAlpha(theme.colors.accent, .14),
          }]}
        >
          {busy
            ? <ActivityIndicator color={theme.colors.accent} />
            : (
              <Text allowFontScaling={false} style={[styles.glyph, { color: theme.colors.accent }]}>
                !
              </Text>
            )}
        </View>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
          style={[styles.title, { color: theme.colors.text, fontFamily: theme.fontFamily }]}
        >
          {scope.strings.translate(state.titleKey)}
        </Text>
        <Text
          maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
          style={[styles.body, { color: theme.colors.mutedText, fontFamily: theme.fontFamily }]}
        >
          {scope.strings.translate(state.bodyKey)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scope.strings.translate(state.actionKey)}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={recover}
          style={[styles.action, {
            backgroundColor: theme.colors.accent,
            borderRadius: radius.pill,
          }]}
        >
          <Text
            maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
            style={[styles.actionText, {
              color: theme.colors.onAccent,
              fontFamily: theme.fontFamily,
            }]}
          >
            {scope.strings.translate(state.actionKey)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * §3.13.4 tray statement. Neutral throughout, never the accent: sales ending
 * is not an error and not a promotion.
 */
export function SeatLayerPickerSalesClosedStatement(
  props: Readonly<{ style?: StyleProp<ViewStyle> }>,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  if (scope.snapshot?.event.salesClosed !== true) return null;
  const theme = scope.resolvedTheme;
  const dateLine = seatLayerPickerEventDateLine(scope.snapshot, scope.strings.locale);
  return (
    <View
      style={[
        styles.statement,
        {
          backgroundColor: seatLayerPickerColorAlpha(theme.colors.text, .06),
          borderRadius: radius.base,
        },
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
    >
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
        style={[styles.statementTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]}
      >
        {scope.strings.translate("salesClosed")}
      </Text>
      <Text
        maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
        style={[styles.body, { color: theme.colors.mutedText, fontFamily: theme.fontFamily }]}
      >
        {scope.strings.translate("salesClosedCopy")}
      </Text>
      {dateLine
        ? (
          <Text
            maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
            style={[styles.body, {
              color: theme.colors.mutedText,
              fontFamily: theme.fontFamily,
            }]}
          >
            {dateLine}
          </Text>
        )
        : null}
    </View>
  );
}

/** The event's own date line, in its own timezone where it reports one. */
export function seatLayerPickerEventDateLine(
  snapshot: Parameters<typeof seatLayerPickerAccessPanel>[0],
  locale?: string | null,
): string | undefined {
  const startsAt = snapshot?.event.startsAt;
  if (typeof startsAt !== 'number' || !Number.isFinite(startsAt)) return undefined;
  try {
    return new Intl.DateTimeFormat(
      typeof locale === 'string' && locale ? locale : snapshot?.event.locale ?? 'en',
      {
        dateStyle: 'long',
        timeStyle: 'short',
        ...(snapshot?.event.timezone ? { timeZone: snapshot.event.timezone } : {}),
      },
    ).format(new Date(startsAt));
  } catch {
    return undefined;
  }
}

const styles = seatLayerPickerBoldStyles(StyleSheet.create({
  veil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 10,
    alignItems: "center",
    maxWidth: 420,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: seatLayerPickerTokens.elevation.confirmCard,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontSize: 24, fontWeight: "900" },
  title: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 13.5, lineHeight: 19, textAlign: "center" },
  action: {
    minHeight: size.minimumHitTarget,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  actionText: { fontSize: 15, fontWeight: "800" },
  statement: { padding: 14, gap: 6 },
  statementTitle: { fontSize: 15, fontWeight: "800" },
}));
