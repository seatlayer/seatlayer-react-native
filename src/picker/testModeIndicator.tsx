import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { SeatLayerPickerStringResolver } from "./locale";
import { resolveSeatLayerPickerMapChromeTheme, seatLayerPickerColorAlpha } from "./mapChromeTheme";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { supportsSeatLayerPickerNativeChrome } from "./surfaces";
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles, type SeatLayerPickerThemeStyles } from "./styles";
import { deriveSeatLayerPickerOnAccent, type SeatLayerPickerThemeData } from "./theme";
import { seatLayerPickerTokens } from "./tokens.g";

type Slots = Pick<SeatLayerPickerStyles, "statusContainer" | "statusText">;
/** Compact badge paint height for layout owners; its hit target stays separate. */
export const seatLayerPickerTestModeIndicatorCompactHeight = 20;
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
  const dark = props.theme.themeMode === "dark";
  const slots = resolveSeatLayerPickerStyles(props.themeStyles, props.slots);
  const spoken = typeof props.spokenLabel === "string" && props.spokenLabel.trim()
    ? props.spokenLabel.trim() : props.strings.translate("testMode");
  return <View accessibilityRole="text" accessibilityLabel={spoken} style={[
    styles.root, props.compact ? styles.compact : styles.wide,
    dark ? { backgroundColor: seatLayerPickerColorAlpha(props.theme.colors.surface, .92), borderColor: props.theme.colors.warning, shadowColor: props.theme.colors.text }
      : { backgroundColor: props.theme.colors.warning, borderColor: props.theme.colors.warning, shadowColor: props.theme.colors.text },
    slots.statusContainer, sanitizeSeatLayerPickerStyle(props.style),
  ]}>
    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.text, { color: dark ? props.theme.colors.warning : deriveSeatLayerPickerOnAccent(props.theme.colors.warning, props.theme.colors.text), fontFamily: props.theme.fontFamily }, slots.statusText]}>{props.strings.translate("testMode")}</Text>
  </View>;
}
export function SeatLayerPickerTestModeIndicator(props: SeatLayerPickerTestModeIndicatorProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  if (!supportsSeatLayerPickerNativeChrome(scope.controller) || scope.snapshot?.event.mode !== "test") return null;
  return <SeatLayerPickerTestModeIndicatorView {...props} testMode theme={resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot)} strings={scope.strings} themeStyles={scope.styles} />;
}
const styles = StyleSheet.create({
  root: { alignSelf: "flex-start", justifyContent: "center", borderRadius: seatLayerPickerTokens.radius.pill, borderWidth: StyleSheet.hairlineWidth, shadowOpacity: .2, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  compact: { height: seatLayerPickerTestModeIndicatorCompactHeight, paddingHorizontal: 8 }, wide: { paddingHorizontal: 10, paddingVertical: 6 },
  text: { fontSize: 10, lineHeight: 12, fontWeight: "900", letterSpacing: .6 },
});
