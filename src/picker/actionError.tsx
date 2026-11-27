import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { seatLayerPickerBuyerError } from './errorWords';
import { seatLayerPickerToldAsMessage } from './connectionMessages';
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from "./styles";
import { seatLayerPickerTokens } from "./tokens.g";
import { seatLayerPickerBoldStyles } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';
import { seatLayerPickerLineStart } from './drawnShape';

export interface SeatLayerPickerActionErrorProps {
  /** An exact command error may override the current scoped command error. */
  readonly error?: unknown;
  readonly clearable?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<
    SeatLayerPickerStyles,
    "errorContainer" | "errorText" | "statusAction" | "statusActionText"
  >;
}

/** The share of the screen a long sentence may take before it scrolls. */
const maxHeightFraction = 0.15;
const minMaxHeight = 84;

/** Inline command failure; it never replaces the pre-ready fatal-error surface. */
export function SeatLayerPickerActionError(
  props: SeatLayerPickerActionErrorProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const { height } = useWindowDimensions();
  const error = props.error ?? (scope.isReady ? scope.error : undefined);
  // A lost line, or a server fault while securing seats, is said by the small
  // message instead.
  if (error === undefined || (props.error === undefined && seatLayerPickerToldAsMessage(error))) return null;
  const slots = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  // The current scoped command error is dismissible by default. An explicitly
  // supplied error is observational and must never clear unrelated scope state.
  const clearable = props.clearable !== false && scope.isReady && scope.error === error;
  const words = seatLayerPickerBuyerError(error, scope.strings);
  const ink = { color: scope.resolvedTheme.colors.error, fontFamily: scope.resolvedTheme.fontFamily };
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        {
          backgroundColor: scope.resolvedTheme.colors.surface,
          borderColor: scope.resolvedTheme.colors.error,
        },
        slots.errorContainer,
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
    >
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.column}
        style={[styles.scroll, { maxHeight: Math.max(height * maxHeightFraction, minMaxHeight) }]}
      >
        <Text style={[styles.text, ink, slots.errorText]}>{words.message}</Text>
        {words.detail === undefined
          ? null
          : <Text style={[styles.detail, ink, slots.errorText]}>{words.detail}</Text>}
      </ScrollView>
      {!clearable ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scope.strings.translate("dismissError")}
          onPress={scope.clearError}
          style={styles.hit}
        >
          <View style={[styles.paint, {
            borderRadius: seatLayerPickerTokens.radius.button,
          }, slots.statusAction]}>
            <Text style={[styles.actionText, {
              color: scope.resolvedTheme.colors.text,
              fontFamily: scope.resolvedTheme.fontFamily,
            }, slots.statusActionText]}>
              {"\u00D7"}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = seatLayerPickerBoldStyles(StyleSheet.create({
  root: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: seatLayerPickerLineWidth,
    paddingHorizontal: 10,
  },
  scroll: { flex: 1, flexGrow: 1 },
  column: { gap: 2, paddingVertical: 10 },
  text: { ...seatLayerPickerLineStart, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  detail: { ...seatLayerPickerLineStart, fontSize: 13, lineHeight: 18 },
  hit: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  paint: { height: 40, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: 20, fontWeight: "600" },
}));
