import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from "./styles";
import { seatLayerPickerTokens } from "./tokens.g";
import { seatLayerPickerBoldStyles } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';

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

function buyerMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  try {
    const field = Object.getOwnPropertyDescriptor(error, "buyerMessage");
    const value = field?.enumerable && "value" in field ? field.value : undefined;
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  } catch {
    return fallback;
  }
}

/** Inline command failure; it never replaces the pre-ready fatal-error surface. */
export function SeatLayerPickerActionError(
  props: SeatLayerPickerActionErrorProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const error = props.error ?? (scope.isReady ? scope.error : undefined);
  if (error === undefined) return null;
  const slots = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  // The current scoped command error is dismissible by default. An explicitly
  // supplied error is observational and must never clear unrelated scope state.
  const clearable = props.clearable !== false && scope.isReady && scope.error === error;
  const label = buyerMessage(error, scope.strings.translate("errorMessage"));
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
      <Text
        numberOfLines={2}
        style={[
          styles.text,
          {
            color: scope.resolvedTheme.colors.error,
            fontFamily: scope.resolvedTheme.fontFamily,
          },
          slots.errorText,
        ]}
      >
        {label}
      </Text>
      {!clearable ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scope.strings.translate("close")}
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
              {scope.strings.translate("close")}
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
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
  hit: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  paint: { height: 40, paddingHorizontal: 8, justifyContent: "center" },
  actionText: { fontSize: 13, fontWeight: "800" },
}));
