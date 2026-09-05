import React, { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  Pressable, ScrollView, StyleSheet, Text, type StyleProp, View, type ViewStyle,
} from "react-native";

import { isSeatLayerPickerSoldOut } from "./emptyState";
import { seatLayerPickerColorAlpha } from "./colors";
import { seatLayerPickerHoldOwnershipStore } from "./holdOwnership";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { sanitizeSeatLayerPickerStyle } from "./styles";
import { seatLayerPickerTokens } from "./tokens.g";

const size = seatLayerPickerTokens.size;
const radius = seatLayerPickerTokens.radius;

/** §4.10: buyer-facing states let type grow to 1.6 before the layout breaks. */
export const seatLayerPickerStateScaleClamp = seatLayerPickerTokens.type.scaleClamp.state;

export interface SeatLayerPickerStateOverlayProps {
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * §3.13.5. A veil over the map: an uppercase letter-spaced eyebrow — the brand
 * or event name, falling back to `strings.soldOutEyebrow` — a large title, and
 * a muted line. Informational only: there is no waitlist, and it clears live.
 */
export function SeatLayerPickerSoldOutOverlay(
  props: SeatLayerPickerStateOverlayProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  if (!scope.isReady || !isSeatLayerPickerSoldOut(scope.snapshot)) return null;
  const theme = scope.resolvedTheme;
  const eyebrow = scope.snapshot?.branding.brandName?.trim() ||
    scope.snapshot?.event.name?.trim() ||
    scope.strings.translate("soldOutEyebrow");
  return (
    <View
      accessibilityLiveRegion="polite"
      pointerEvents="box-none"
      style={[
        styles.veil,
        { backgroundColor: seatLayerPickerColorAlpha(theme.colors.background, .92) },
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
    >
      <Text
        maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
        style={[styles.eyebrow, { color: theme.colors.mutedText, fontFamily: theme.fontFamily }]}
      >
        {eyebrow.toLocaleUpperCase()}
      </Text>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
        style={[styles.soldOutTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]}
      >
        {scope.strings.translate("soldOutTitle")}
      </Text>
      <Text
        maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
        style={[styles.body, { color: theme.colors.mutedText, fontFamily: theme.fontFamily }]}
      >
        {scope.strings.translate("soldOutCopy")}
      </Text>
    </View>
  );
}

export interface SeatLayerPickerBookedOverlayProps extends SeatLayerPickerStateOverlayProps {
  /** The way back. Where a host gives none, the overlay simply closes itself. */
  readonly onBackToMap?: () => void;
}

/**
 * §3.13.10. Never shown on the hand-off: a buyer on the way to pay has not
 * paid. It appears only once the handed-off hold has settled to booked, which
 * the controller decides from the runtime's own expiry signal (§3.13).
 */
export function SeatLayerPickerBookedOverlay(
  props: SeatLayerPickerBookedOverlayProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const controller = scope.controller;
  const booked = useSyncExternalStore(
    controller.subscribeBooked,
    controller.getBookedHandoff,
    controller.getBookedHandoff,
  );
  const backRef = useRef<View | null>(null);
  useEffect(() => {
    if (booked === undefined) return;
    // The way back takes focus on the next frame, so a screen reader lands on
    // the one thing there is to do rather than at the top of the tree.
    const handle = setTimeout(() => {
      (backRef.current as unknown as { focus?: () => void } | null)?.focus?.();
    }, 0);
    return () => clearTimeout(handle);
  }, [booked]);
  const back = useCallback(() => {
    props.onBackToMap?.();
    seatLayerPickerHoldOwnershipStore(controller).clear();
  }, [controller, props]);
  if (booked === undefined) return null;
  const theme = scope.resolvedTheme;
  const tickets = booked.lineItems.reduce(
    (total, line) => total + (Number.isFinite(line.quantity) ? line.quantity : 1),
    0,
  );
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.cover,
        { backgroundColor: theme.colors.background },
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
    >
      <View
        accessible={false}
        style={[styles.badge, { backgroundColor: theme.colors.accent }]}
      >
        <Text allowFontScaling={false} style={[styles.check, { color: theme.colors.onAccent }]}>
          ✓
        </Text>
      </View>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
        style={[styles.allSet, { color: theme.colors.text, fontFamily: theme.fontFamily }]}
      >
        {scope.strings.translate("allSetTitle")}
      </Text>
      <Text
        maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
        style={[styles.body, { color: theme.colors.mutedText, fontFamily: theme.fontFamily }]}
      >
        {`${scope.strings.translate("ticketCount", { count: tickets })} ${
          scope.strings.translate("confirmedAndOnWay")
        }`}
      </Text>
      <ScrollView contentContainerStyle={styles.pills}>
        {booked.lineItems.map((line) => (
          <View
            key={line.lineKey}
            style={[styles.pill, {
              borderColor: theme.colors.divider,
              backgroundColor: theme.colors.surface,
            }]}
          >
            <Text
              maxFontSizeMultiplier={seatLayerPickerStateScaleClamp}
              style={[styles.pillText, {
                color: theme.colors.text,
                fontFamily: theme.fontFamily,
              }]}
            >
              {line.displayLabel ?? line.label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Pressable
        ref={backRef}
        accessibilityRole="button"
        accessibilityLabel={scope.strings.translate("backToMap")}
        onPress={back}
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
          {scope.strings.translate("backToMap")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  cover: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6, textAlign: "center" },
  soldOutTitle: { fontSize: 34, fontWeight: "900", textAlign: "center" },
  allSet: { fontSize: 26, fontWeight: "900", textAlign: "center" },
  body: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  check: { fontSize: 36, fontWeight: "900" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  pill: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12.5, fontWeight: "700" },
  action: {
    minHeight: size.minimumHitTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  actionText: { fontSize: 15, fontWeight: "800" },
});
