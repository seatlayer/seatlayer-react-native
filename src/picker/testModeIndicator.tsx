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
import { seatLayerPickerBoldStyles } from './boldText';

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
    <View pointerEvents="none" style={[styles.halo, { backgroundColor: seatLayerPickerColorAlpha(warning, .22) }]}>
      <View style={[styles.dot, { backgroundColor: warning }]} />
    </View>
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
/** How far the status light's halo stands out past the light itself. */
const haloSpread = 3;
/** The pill's hairline, a whole point as the reference draws it. */
const chipBorder = 1;
const styles = seatLayerPickerBoldStyles(StyleSheet.create({
  root: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: seatLayerPickerTokens.radius.pill,
    // One point, not a hairline: the reference's `Border.all` is a whole point.
    borderWidth: chipBorder,
    flexDirection: "row",
    height: seatLayerPickerTokens.size.testChipHeight,
    justifyContent: "center",
  },
  // Eight before the light, ten after the word: `fromSTEB(8, 0, 10, 0)`, LESS
  // the hairline. The reference paints its border with a `DecoratedBox`, which
  // does not inset what it wraps; a React Native border always boxes its
  // content, so the pill's padding carries the border's own width or the chip
  // comes out two points wide with its word a point late.
  compact: { paddingEnd: 10 - chipBorder, paddingStart: 8 - chipBorder },
  wide: { paddingEnd: 12 - chipBorder, paddingStart: 10 - chipBorder },
  // The status light's own halo, drawn as the ring it is: the reference casts
  // it with `BoxShadow(spreadRadius: 3)` and NO blur, which is a hard ring of
  // three points in the warning colour at just over a fifth.
  halo: {
    alignItems: 'center',
    borderRadius: dotSize / 2 + haloSpread,
    height: dotSize + haloSpread * 2,
    justifyContent: 'center',
    marginEnd: 7 - haloSpread,
    marginStart: -haloSpread,
    width: dotSize + haloSpread * 2,
  },
  dot: {
    borderRadius: dotSize / 2,
    height: dotSize,
    width: dotSize,
  },
  text: {
    fontSize: seatLayerPickerTokens.size.testChipFontSize,
    fontWeight: "700",
    letterSpacing: seatLayerPickerTokens.size.testChipFontSize * .01,
    // Measured, not copied: the reference's own `height: 1` puts the word a
    // point ABOVE where the reference frame prints it once React Native has
    // centred the line box in the pill, so the box keeps its three points.
    lineHeight: seatLayerPickerTokens.size.testChipFontSize + 3,
  },
}));
