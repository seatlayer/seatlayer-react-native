import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { SeatLayerPickerStringResolver } from "./locale";
import { resolveSeatLayerPickerMapChromeTheme, seatLayerPickerColorAlpha } from "./mapChromeTheme";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { supportsSeatLayerPickerNativeChrome } from "./surfaces";
import {
  seatLayerPickerTestChipInk,
  seatLayerPickerTestChipWash,
} from "./testChipInk";
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles, type SeatLayerPickerThemeStyles } from "./styles";
import type { SeatLayerPickerThemeData } from "./theme";
import { seatLayerPickerTokens } from "./tokens.g";

type Slots = Pick<SeatLayerPickerStyles, "statusContainer" | "statusText">;
/**
 * §3.4. Required chrome for a test event: one recipe in both themes, amber and
 * never the accent — an environment flag must not wear "buy" gold. Exported for
 * the layout owner that reserves the top-left corner for it.
 */
export const seatLayerPickerTestModeIndicatorCompactHeight =
  seatLayerPickerTokens.size.testChipHeight;

export interface SeatLayerPickerTestModeIndicatorProps {
  readonly compact?: boolean;
  readonly spokenLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Slots;
}
export interface SeatLayerPickerTestModeIndicatorViewProps extends SeatLayerPickerTestModeIndicatorProps {
  readonly testMode: boolean;
  readonly theme: SeatLayerPickerThemeData;
  readonly strings: SeatLayerPickerStringResolver;
  readonly themeStyles?: SeatLayerPickerThemeStyles;
}

export function SeatLayerPickerTestModeIndicatorView(props: SeatLayerPickerTestModeIndicatorViewProps): React.ReactElement | null {
  if (!props.testMode) return null;
  const slots = resolveSeatLayerPickerStyles(props.themeStyles, props.slots);
  const warning = props.theme.colors.warning;
  // The chip is painted on the wash OVER the surface, so the ink is measured
  // against the wash rather than the surface itself.
  const wash = seatLayerPickerTestChipWash(
    warning,
    props.theme.colors.surface,
    seatLayerPickerTokens.opacity.warnPillWash,
  );
  const ink = seatLayerPickerTestChipInk(warning, props.theme.colors.text, wash);
  const spoken = typeof props.spokenLabel === "string" && props.spokenLabel.trim()
    ? props.spokenLabel.trim()
    : props.strings.translate("testModeLong");
  return <View
    accessibilityRole="text"
    accessibilityLabel={spoken}
    accessibilityHint={props.strings.translate("testModeExplained")}
    style={[
      styles.root,
      props.compact ? styles.compact : styles.wide,
      { backgroundColor: wash, borderColor: seatLayerPickerColorAlpha(warning, 0.5), shadowColor: warning },
      slots.statusContainer,
      sanitizeSeatLayerPickerStyle(props.style),
    ]}
  >
    <View
      pointerEvents="none"
      style={[styles.dot, { backgroundColor: warning, shadowColor: warning }]}
    />
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      style={[styles.text, { color: ink, fontFamily: props.theme.fontFamily }, slots.statusText]}
    >{props.strings.translate("testMode")}</Text>
  </View>;
}
export function SeatLayerPickerTestModeIndicator(props: SeatLayerPickerTestModeIndicatorProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  if (!supportsSeatLayerPickerNativeChrome(scope.controller) || scope.snapshot?.event.mode !== "test") return null;
  return <SeatLayerPickerTestModeIndicatorView {...props} testMode theme={resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot)} strings={scope.strings} themeStyles={scope.styles} />;
}
const dotSize = seatLayerPickerTokens.size.testChipDotSize;
const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: seatLayerPickerTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: seatLayerPickerTokens.size.testChipHeight,
    justifyContent: "center",
  },
  compact: { paddingHorizontal: 8 },
  wide: { paddingHorizontal: 10 },
  dot: {
    borderRadius: dotSize / 2,
    height: dotSize,
    marginEnd: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: .55,
    shadowRadius: 4,
    width: dotSize,
  },
  text: {
    fontSize: seatLayerPickerTokens.size.testChipFontSize,
    fontWeight: "800",
    letterSpacing: .1,
    lineHeight: seatLayerPickerTokens.size.testChipFontSize + 3,
  },
});
