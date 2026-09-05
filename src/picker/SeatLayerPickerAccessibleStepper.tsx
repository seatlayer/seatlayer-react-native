import React, { useCallback, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, View, type ViewStyle } from "react-native";

import {
  seatLayerPickerAccessibleSectionCount,
  seatLayerPickerAccessibleTourStore,
  seatLayerSectionAccessCountsCapability,
  shouldDrawSeatLayerPickerAccessibleStepper,
  type SeatLayerPickerAccessibleTour,
} from "./accessibilityFocus";
import { SeatLayerPickerAccessIcon } from "./accessibilityIcon";
import { SeatLayerPickerBlockedRegion } from "./blockedRegionsContext";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { sanitizeSeatLayerPickerStyle } from "./styles";
import { seatLayerPickerTokens } from "./tokens.g";

const size = seatLayerPickerTokens.size;

/**
 * The figure the pill prints. A step wins over a count; where the counts are
 * not reported at all the pill draws the glyph and the chevron with no figure
 * until the first step answers — a runtime that flies but does not count still
 * has a tour.
 */
export function seatLayerPickerAccessibleStepperFigure(
  tour: SeatLayerPickerAccessibleTour,
  sectionCount: number | undefined,
  translate: (key: string, options?: { values?: Record<string, string | number> }) => string,
): string | undefined {
  if (tour.step) {
    return translate("accessibleStep", {
      values: { index: tour.step.index + 1, total: tour.step.total },
    });
  }
  return sectionCount === undefined
    ? undefined
    : translate("accessibleSections", { values: { count: sectionCount } });
}

export interface SeatLayerPickerAccessibleStepperProps {
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * `♿ 2 of 6 ›` beside the accessibility control. Drawn only while a filter is
 * active and the runtime advertises `accessibility-focus-v1`; a `null` step
 * retires it, because nothing matching is an answer rather than a failure.
 */
export function SeatLayerPickerAccessibleStepper(
  props: SeatLayerPickerAccessibleStepperProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const store = seatLayerPickerAccessibleTourStore(scope.controller);
  const tour = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const activeTypes = scope.snapshot?.map.accessibilityFilter ?? [];
  const countsReported = scope.snapshot?.capabilities
    .includes(seatLayerSectionAccessCountsCapability) === true;
  const sectionCount = seatLayerPickerAccessibleSectionCount(
    scope.snapshot?.sections, activeTypes, countsReported,
  );
  const reconciled = store.observe(activeTypes);
  const press = useCallback(() => {
    const types = [...activeTypes];
    void scope.controller.focusNextAccessibleSection(types).then(
      (step) => { store.accept(types, step); },
      (error: unknown) => { scope.reportError(error); },
    );
  }, [activeTypes, scope, store]);
  if (!shouldDrawSeatLayerPickerAccessibleStepper({
    supportsTour: scope.controller.supportsAccessibleSectionTour,
    activeTypes,
    sectionCount,
    tour: reconciled,
  })) return null;
  const theme = scope.resolvedTheme;
  const figure = seatLayerPickerAccessibleStepperFigure(
    reconciled,
    sectionCount,
    (key, options) => scope.strings.translate(key, options),
  );
  return (
    // §2.4 — a control on the map reports its own rectangle.
    <SeatLayerPickerBlockedRegion pointerEvents="auto">
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[figure, scope.strings.translate("accessJumpNextSection")]
        .filter(Boolean).join(", ")}
      accessibilityState={{ disabled: scope.isBusy }}
      disabled={scope.isBusy}
      onPress={press}
      style={[styles.target, sanitizeSeatLayerPickerStyle(props.style)]}
    >
      <View
        accessible={false}
        style={[styles.pill, {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.divider,
        }]}
      >
        <SeatLayerPickerAccessIcon color={theme.colors.accent} size={14} variant="iso" />
        {figure
          ? (
            <Text
              style={[styles.figure, {
                color: theme.colors.text,
                fontFamily: theme.fontFamily,
              }]}
            >
              {figure}
            </Text>
          )
          : null}
        <Text
          allowFontScaling={false}
          style={[styles.chevron, { color: theme.colors.mutedText }]}
        >
          ›
        </Text>
      </View>
    </Pressable>
    </SeatLayerPickerBlockedRegion>
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: size.minimumHitTarget,
    minWidth: size.minimumHitTarget,
    marginLeft: size.accessStepGap,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    height: size.accessStepHeight,
    paddingHorizontal: size.accessStepPaddingX,
    borderRadius: seatLayerPickerTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  figure: {
    fontSize: size.accessStepFontSize,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  chevron: { fontSize: size.accessStepFontSize + 4, fontWeight: "700" },
});
