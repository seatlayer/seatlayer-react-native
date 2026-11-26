import React, { useCallback, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, Text, type StyleProp, View, type ViewStyle } from "react-native";

import { seatLayerPickerHoldOwnershipStore } from "./holdOwnership";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { sanitizeSeatLayerPickerStyle } from "./styles";
import { seatLayerPickerTokens } from "./tokens.g";
import { seatLayerPickerBoldStyles } from './boldText';
import { seatLayerPickerLineStart } from './drawnShape';

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
        {/* The notice stands whole wherever it fits. Only where the screen
            has no more room for it do the words scroll, and the button under
            them stays whole and in reach. */}
        <ScrollView
          contentContainerStyle={styles.wordsContent}
          nestedScrollEnabled
          style={styles.words}
          testID="seatlayer-hold-notice-words"
        >
          <Text accessibilityRole="header" style={[styles.title, { fontFamily: theme.fontFamily }]}>
            {scope.strings.translate(notice.titleKey)}
          </Text>
          <Text style={[styles.body, { fontFamily: theme.fontFamily }]}>
            {scope.strings.translate(notice.bodyKey)}
          </Text>
        </ScrollView>
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
              <Text style={[styles.actionText, { fontFamily: theme.fontFamily }]}>
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

const styles = seatLayerPickerBoldStyles(StyleSheet.create({
  root: {
    alignItems: "flex-start",
    flexDirection: "row",
    // It is the one part of the cart's foot that gives way, and only once the
    // open list over it has none left to give.
    flexShrink: 1,
    paddingEnd: 4,
    paddingStart: 12,
    paddingVertical: 10,
  },
  column: { alignSelf: "stretch", flex: 1, gap: 2, paddingStart: 9 },
  words: { flexGrow: 0, flexShrink: 1 },
  wordsContent: { gap: 2 },
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
  title: { ...seatLayerPickerLineStart, color: noticeInk, fontSize: 15, fontWeight: "700" },
  body: { ...seatLayerPickerLineStart, color: noticeInk, fontSize: 13, lineHeight: 18 },
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
  actionText: { color: noticeInk, fontSize: 13, fontWeight: "700", textAlign: "center" },
  dismiss: {
    alignItems: "center",
    height: size.minimumHitTarget,
    justifyContent: "center",
    width: size.minimumHitTarget,
  },
  cross: { alignItems: "center", height: 12, justifyContent: "center", width: 12 },
  crossBar: { backgroundColor: noticeInk, borderRadius: 1, height: 1.6, position: "absolute", width: 13 },
}));
