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
        // The bar is a STATE, and it wears the error ground the way the
        // reference does — white ink on it in both themes, because the ink has
        // to be legible on an authored red rather than on the panel behind it.
        { backgroundColor: theme.colors.error },
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
    >
      <View accessible={false} style={styles.markRing}>
        <View style={styles.markStem} />
        <View style={styles.markDot} />
      </View>
      <View style={styles.column}>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={[styles.title, { fontFamily: theme.fontFamily }]}
        >
          {scope.strings.translate(notice.titleKey)}
        </Text>
        <Text numberOfLines={3} style={[styles.body, { fontFamily: theme.fontFamily }]}>
          {scope.strings.translate(notice.bodyKey)}
        </Text>
        {notice.actionKey
          ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={scope.strings.translate(notice.actionKey)}
              accessibilityState={{ disabled: releasing, busy: releasing }}
              disabled={releasing}
              onPress={release}
              style={[styles.action, {
                borderRadius: seatLayerPickerTokens.radius.button,
                opacity: releasing ? 0.6 : 1,
              }]}
            >
              <Text numberOfLines={1} style={[styles.actionText, { fontFamily: theme.fontFamily }]}>
                {scope.strings.translate(notice.actionKey)}
              </Text>
            </Pressable>
          )
          : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={scope.strings.translate("close")}
        onPress={() => store.clear()}
        style={styles.dismiss}
      >
        <View accessible={false} style={styles.cross}>
          <View style={[styles.crossBar, { transform: [{ rotate: "45deg" }] }]} />
          <View style={[styles.crossBar, { transform: [{ rotate: "-45deg" }] }]} />
        </View>
      </Pressable>
    </View>
  );
}

/** White in both themes: the ink is read on the authored red, not on the panel. */
const noticeInk = "#FFFFFF";

const styles = StyleSheet.create({
  root: {
    alignItems: "flex-start",
    flexDirection: "row",
    paddingEnd: 4,
    paddingStart: 12,
    paddingVertical: 10,
  },
  column: { flex: 1, gap: 2, paddingStart: 9 },
  markRing: {
    alignItems: "center",
    borderColor: noticeInk,
    borderRadius: 10,
    borderWidth: 1.6,
    height: 20,
    justifyContent: "center",
    marginTop: 1,
    width: 20,
  },
  markStem: { backgroundColor: noticeInk, borderRadius: 1, height: 6, marginBottom: 1.5, width: 1.8 },
  markDot: { backgroundColor: noticeInk, borderRadius: 1.1, height: 2.2, width: 2.2 },
  title: { color: noticeInk, fontSize: 15, fontWeight: "700" },
  body: { color: noticeInk, fontSize: 13, lineHeight: 18 },
  action: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: noticeInk,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 6,
    minHeight: 34,
    paddingHorizontal: 14,
  },
  actionText: { color: noticeInk, fontSize: 13, fontWeight: "700" },
  dismiss: {
    alignItems: "center",
    height: size.minimumHitTarget,
    justifyContent: "center",
    width: size.minimumHitTarget,
  },
  cross: { alignItems: "center", height: 12, justifyContent: "center", width: 12 },
  crossBar: { backgroundColor: noticeInk, borderRadius: 1, height: 1.6, position: "absolute", width: 13 },
});
