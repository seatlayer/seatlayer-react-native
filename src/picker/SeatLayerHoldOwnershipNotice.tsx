import React, { useCallback, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, View, type ViewStyle } from "react-native";

import { seatLayerPickerHoldOwnershipStore } from "./holdOwnership";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { sanitizeSeatLayerPickerStyle } from "./styles";
import { seatLayerPickerTokens } from "./tokens.g";

const size = seatLayerPickerTokens.size;

export interface SeatLayerHoldOwnershipNoticeProps {
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * §3.13.13 (N1 = B). The runtime refuses to grow or shrink a hold the host
 * owns, and none of those refusals is a failure the buyer can read as one — so
 * the bar says the STATE. The runtime's own sentence is never shown.
 *
 * "Release and change seats" rejects the handoff, which puts the seats back on
 * sale; the notice clears when the release lands.
 */
export function SeatLayerHoldOwnershipNotice(
  props: SeatLayerHoldOwnershipNoticeProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const store = seatLayerPickerHoldOwnershipStore(scope.controller);
  const notice = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [releasing, setReleasing] = useState(false);
  const release = useCallback(() => {
    setReleasing(true);
    void scope.controller.releaseHandoffAndChangeSeats().then(
      (released) => {
        setReleasing(false);
        if (released) store.clear();
      },
      (error: unknown) => {
        setReleasing(false);
        scope.reportError(error);
      },
    );
  }, [scope, store]);
  if (notice === undefined) return null;
  const theme = scope.resolvedTheme;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.divider,
          borderRadius: seatLayerPickerTokens.radius.base,
        },
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: theme.colors.text, fontFamily: theme.fontFamily }]}
      >
        {scope.strings.translate(notice.titleKey)}
      </Text>
      <Text style={[styles.body, { color: theme.colors.mutedText, fontFamily: theme.fontFamily }]}>
        {scope.strings.translate(notice.bodyKey)}
      </Text>
      <View style={styles.actions}>
        {notice.actionKey
          ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={scope.strings.translate(notice.actionKey)}
              accessibilityState={{ disabled: releasing, busy: releasing }}
              disabled={releasing}
              onPress={release}
              style={[styles.action, {
                backgroundColor: theme.colors.accent,
                borderRadius: seatLayerPickerTokens.radius.button,
              }]}
            >
              <Text
                numberOfLines={1}
                style={[styles.actionText, {
                  color: theme.colors.onAccent,
                  fontFamily: theme.fontFamily,
                }]}
              >
                {scope.strings.translate(notice.actionKey)}
              </Text>
            </Pressable>
          )
          : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scope.strings.translate("close")}
          onPress={() => store.clear()}
          style={[styles.dismiss, {
            borderColor: theme.colors.divider,
            borderRadius: seatLayerPickerTokens.radius.button,
          }]}
        >
          <Text
            style={[styles.actionText, {
              color: theme.colors.text,
              fontFamily: theme.fontFamily,
            }]}
          >
            {scope.strings.translate("close")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 6,
  },
  title: { fontSize: 15, fontWeight: "800" },
  body: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, paddingTop: 4 },
  action: {
    flex: 1,
    minHeight: size.minimumHitTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  dismiss: {
    minHeight: size.minimumHitTarget,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  actionText: { fontSize: 13, fontWeight: "800" },
});
