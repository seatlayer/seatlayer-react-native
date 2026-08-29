import React from "react";
import {
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { resolveSeatLayerPickerMapChromeTheme } from "./mapChromeTheme";
import { supportsSeatLayerPickerNativeChrome } from "./surfaces";
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
  type SeatLayerPickerThemeStyles,
} from "./styles";
import { seatLayerPickerTokens } from "./tokens.g";

type AttributionSlots = Pick<
  SeatLayerPickerStyles,
  "attributionContainer" | "attributionText" | "attributionMark"
>;
export interface SeatLayerPickerAttributionProps {
  readonly compact?: boolean;
  readonly visible?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: AttributionSlots;
}
interface AttributionViewProps extends SeatLayerPickerAttributionProps {
  readonly required: boolean;
  readonly label: string;
  readonly textColor: string;
  readonly markInk: string;
  readonly fontFamily?: string;
  readonly themeStyles?: SeatLayerPickerThemeStyles;
}
/** Context-free attribution. Entitlement-required rendering cannot be styled away. */
export function SeatLayerPickerAttributionView({
  compact = true,
  label,
  required,
  slots: componentSlots,
  style,
  visible,
  textColor,
  markInk,
  fontFamily,
  themeStyles,
}: AttributionViewProps): React.ReactElement | null {
  if (!required && visible !== true) return null;
  const slots: Partial<SeatLayerPickerStyles> = required
    ? {}
    : resolveSeatLayerPickerStyles(themeStyles, componentSlots);
  const size = compact ? 12 : 16;
  const root = compact ? styles.compactRoot : styles.regularRoot;
  const rootStyle = required ? root : [root, slots.attributionContainer, sanitizeSeatLayerPickerStyle(style)];
  const markStyle = required
    ? styles.mark
    : [styles.mark, slots.attributionMark];
  const textStyle = compact ? styles.compactText : styles.regularText;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={rootStyle}
    >
      <View
        accessible={false}
        style={[
          markStyle,
          {
            width: size,
            height: size,
            borderRadius: compact ? 3 : 4,
            paddingHorizontal: compact ? 2 : 3,
            paddingVertical: compact ? 2.5 : 3.5,
          },
          { backgroundColor: textColor },
        ]}
      >
        <View style={[styles.bar, { backgroundColor: markInk, width: compact ? 8 : 10 }]} />
        <View style={[styles.bar, { backgroundColor: markInk, width: compact ? 5.5 : 7 }]} />
        <View style={[styles.bar, { backgroundColor: markInk, width: compact ? 3 : 4 }]} />
      </View>
      <Text
        style={[textStyle, required ? undefined : slots.attributionText, {
          color: textColor,
          fontFamily,
        }]}
      >
        {label}
      </Text>
    </View>
  );
}
export function SeatLayerPickerAttribution(
  props: SeatLayerPickerAttributionProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const required = scope.snapshot?.branding.attributionRequired === true;
  if (!required && !supportsSeatLayerPickerNativeChrome(scope.controller)) return null;
  const theme = resolveSeatLayerPickerMapChromeTheme(
    scope.resolvedTheme,
    scope.snapshot,
  );
  return (
    <SeatLayerPickerAttributionView
      {...props}
      label={scope.strings.translate("poweredBy")}
      required={required}
      textColor={theme.colors.text}
      fontFamily={theme.fontFamily}
      markInk={theme.colors.surface}
      themeStyles={scope.styles}
    />
  );
}

const styles = StyleSheet.create({
  compactRoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    opacity: 0.64,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  regularRoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    opacity: 0.72,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  mark: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    justifyContent: "space-between",
  },
  bar: { height: 2, borderRadius: 1 },
  compactText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  regularText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
