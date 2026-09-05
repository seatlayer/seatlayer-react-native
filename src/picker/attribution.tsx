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
import { seatLayerPickerFontWeight } from "./fontWeight";
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
  fontFamily,
  themeStyles,
}: AttributionViewProps): React.ReactElement | null {
  if (!required && visible !== true) return null;
  const slots: Partial<SeatLayerPickerStyles> = required
    ? {}
    : resolveSeatLayerPickerStyles(themeStyles, componentSlots);
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
      <View accessible={false} style={markStyle}>
        <View style={[styles.bar, { width: 10 }]} />
        <View style={[styles.bar, { width: 7 }]} />
        <View style={[styles.bar, { width: 4 }]} />
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
      themeStyles={scope.styles}
    />
  );
}

/**
 * Sixteen points square on every surface: the credit reads as one thing
 * wherever it is drawn, and a mark that shrank with its line read as a smudge.
 */
const markSize = 16;
const markGap = 5;
const creditOpacity = 0.72;
const markPlate = "#0C1220";
const markBar = "#FCF7EE";

const styles = StyleSheet.create({
  compactRoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: markGap,
    opacity: creditOpacity,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  regularRoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: markGap,
    opacity: creditOpacity,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  // The mark is the SeatLayer plate, not a tinted copy of the surface it lands
  // on: it is one logo in one pair of colours wherever the credit is drawn, so
  // it survives the immersive scene's dark sheet unchanged.
  mark: {
    backgroundColor: markPlate,
    borderRadius: 4,
    height: markSize,
    justifyContent: "space-between",
    paddingHorizontal: 3,
    paddingVertical: 3.5,
    width: markSize,
  },
  bar: { backgroundColor: markBar, borderRadius: 1, height: 2 },
  compactText: {
    fontSize: seatLayerPickerTokens.type.attribution.size,
    fontWeight: seatLayerPickerFontWeight(seatLayerPickerTokens.type.attribution.weight),
    letterSpacing: 0.22,
  },
  regularText: {
    fontSize: seatLayerPickerTokens.type.attribution.size + 1,
    fontWeight: seatLayerPickerFontWeight(seatLayerPickerTokens.type.attribution.weight),
    letterSpacing: 0.24,
  },
});
