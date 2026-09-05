import React from "react";
import {
  type GestureResponderEvent, I18nManager, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";

import { SeatLayerPickerAccessIcon } from "./accessibilityIcon";
import { seatLayerPickerColorAlpha } from "./colors";
import { SeatLayerPickerPromptModal } from "./promptModal";
import { normalizeSeatLayerPickerSafeAreaInsets, type SeatLayerPickerSafeAreaInsets } from "./safeAreaInsets";
import type { SeatLayerPickerStyles } from "./styles";
import type { SeatLayerPickerThemeData } from "./theme";
import { seatLayerPickerTokens } from "./tokens.g";

const size = seatLayerPickerTokens.size;
const radius = seatLayerPickerTokens.radius;

/**
 * One row of the accessibility sheet. `count` is PRESENT-ONLY: a provision the
 * runtime did not count shows no number and is never disabled, because absent
 * is not zero. `jumpable` is the count-as-jump chip of §3.5 — it exists only
 * where `accessibility-focus-v1` holds and the count is positive.
 */
export interface SeatLayerPickerAccessSheetRow {
  readonly key: string;
  readonly label: string;
  readonly note?: string;
  readonly count?: number;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly countLabel?: string;
  readonly jumpable: boolean;
  readonly jumpLabel?: string;
}

export interface SeatLayerPickerAccessSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly closeLabel: string;
  readonly theme: SeatLayerPickerThemeData;
  readonly slots: SeatLayerPickerStyles;
  readonly safeAreaInsets: SeatLayerPickerSafeAreaInsets;
  readonly needRows: readonly SeatLayerPickerAccessSheetRow[];
  readonly switchRows: readonly SeatLayerPickerAccessSheetRow[];
  readonly onToggle: (row: SeatLayerPickerAccessSheetRow) => void;
  readonly onJump: (row: SeatLayerPickerAccessSheetRow) => void;
  /** The scrim and the drag handle. Neither moves the camera. */
  readonly onDismiss: () => void;
}

/**
 * The sheet applies as it is flipped: there is no Apply step and no Cancel.
 * A switch IS the action, so staging the flips would ask twice for one
 * decision — and the drag handle, the gesture that closes every other sheet,
 * would have thrown the answers away.
 */
export function SeatLayerPickerAccessibilitySheet(
  props: SeatLayerPickerAccessSheetProps,
): React.ReactElement {
  const insets = normalizeSeatLayerPickerSafeAreaInsets(props.safeAreaInsets);
  return (
    <SeatLayerPickerPromptModal visible={props.visible}>
      <View
        style={[styles.scrim, {
          backgroundColor: seatLayerPickerColorAlpha(props.theme.colors.text, .45),
        }]}
      >
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={props.onDismiss}
          style={styles.backdrop}
        />
        <View
          pointerEvents="box-none"
          style={[styles.bounds, {
            paddingTop: insets.top + 16,
            paddingRight: insets.right + 16,
            paddingBottom: insets.bottom + 16,
            paddingLeft: insets.left + 16,
          }]}
        >
          <Pressable
            accessible={false}
            onPress={(event: GestureResponderEvent) => event.stopPropagation()}
            style={[
              styles.sheet,
              {
                backgroundColor: props.theme.colors.surface,
                borderColor: props.theme.colors.divider,
              },
              props.slots.accessibilityModalContainer,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={props.closeLabel}
              onPress={props.onDismiss}
              style={styles.handleTarget}
            >
              <View
                accessible={false}
                style={[styles.handle, {
                  backgroundColor: props.theme.colors.divider,
                }]}
              />
            </Pressable>
            <Text
              accessibilityRole="header"
              style={[styles.heading, {
                color: props.theme.colors.text,
                fontFamily: props.theme.fontFamily,
              }, props.slots.accessibilityControlLabel]}
            >
              {props.title}
            </Text>
            <ScrollView contentContainerStyle={styles.list}>
              {props.needRows.map((row) => (
                <AccessRow
                  key={row.key}
                  row={row}
                  theme={props.theme}
                  slots={props.slots}
                  onToggle={props.onToggle}
                  onJump={props.onJump}
                />
              ))}
              {props.switchRows.map((row) => (
                <AccessRow
                  key={row.key}
                  row={row}
                  theme={props.theme}
                  slots={props.slots}
                  onToggle={props.onToggle}
                  onJump={props.onJump}
                />
              ))}
            </ScrollView>
          </Pressable>
        </View>
      </View>
    </SeatLayerPickerPromptModal>
  );
}

function AccessRow(props: Readonly<{
  row: SeatLayerPickerAccessSheetRow;
  theme: SeatLayerPickerThemeData;
  slots: SeatLayerPickerStyles;
  onToggle: (row: SeatLayerPickerAccessSheetRow) => void;
  onJump: (row: SeatLayerPickerAccessSheetRow) => void;
}>): React.ReactElement {
  const { row, theme } = props;
  return (
    <View style={styles.rowWrap}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={row.label}
        accessibilityState={{ checked: row.on, disabled: row.disabled }}
        disabled={row.disabled}
        onPress={() => props.onToggle(row)}
        style={[
          styles.row,
          { borderRadius: radius.button },
          props.slots.accessibilityNeedButton,
          row.disabled ? styles.rowDim : null,
        ]}
      >
        <View accessible={false} style={styles.iconCell}>
          <SeatLayerPickerAccessIcon
            color={row.on ? theme.colors.accent : theme.colors.mutedText}
          />
        </View>
        <View style={styles.rowText}>
          <Text
            style={[styles.rowLabel, {
              color: theme.colors.text,
              fontFamily: theme.fontFamily,
            }, props.slots.accessibilityNeedText]}
          >
            {row.label}
          </Text>
          {row.note
            ? (
              <Text
                style={[styles.rowNote, {
                  color: theme.colors.mutedText,
                  fontFamily: theme.fontFamily,
                }]}
              >
                {row.note}
              </Text>
            )
            : null}
        </View>
        {row.countLabel && !row.jumpable
          ? (
            <Text
              style={[styles.rowNote, {
                color: theme.colors.mutedText,
                fontFamily: theme.fontFamily,
              }]}
            >
              {row.countLabel}
            </Text>
          )
          : null}
        <View
          accessible={false}
          style={[styles.track, {
            backgroundColor: row.on
              ? theme.colors.accent
              : seatLayerPickerColorAlpha(theme.colors.mutedText, .3),
            flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
          }]}
        >
          <View
            style={[styles.knob, {
              backgroundColor: row.on
                ? theme.colors.onAccent
                : theme.colors.surface,
              transform: [{
                translateX: row.on
                  ? (I18nManager.isRTL ? -(size.accessSwitchWidth - size.accessSwitchKnob - 4) : size.accessSwitchWidth - size.accessSwitchKnob - 4)
                  : 0,
              }],
            }]}
          />
        </View>
      </Pressable>
      {row.jumpable && row.countLabel
        ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${row.label}, ${row.countLabel}, ${row.jumpLabel ?? ""}`}
            onPress={() => props.onJump(row)}
            style={styles.jumpTarget}
          >
            <View
              accessible={false}
              style={[styles.jumpChip, {
                backgroundColor: seatLayerPickerColorAlpha(theme.colors.accent, .12),
                borderColor: theme.colors.divider,
              }]}
            >
              <Text
                style={[styles.jumpText, {
                  color: theme.colors.text,
                  fontFamily: theme.fontFamily,
                }]}
              >
                {row.countLabel}
              </Text>
            </View>
          </Pressable>
        )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  bounds: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "78%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  handleTarget: {
    alignSelf: "center",
    minHeight: size.minimumHitTarget,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  handle: {
    width: size.sheetGrabberWidth,
    height: size.sheetGrabberHeight,
    borderRadius: radius.pill,
  },
  heading: { fontSize: 20, fontWeight: "800", minHeight: size.minimumHitTarget, paddingTop: 8 },
  list: { paddingBottom: 8 },
  rowWrap: { flexDirection: "row", alignItems: "center" },
  row: {
    flex: 1,
    minHeight: size.minimumHitTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: size.accessRowGap,
    paddingHorizontal: size.accessRowPaddingX,
    paddingVertical: size.accessRowPaddingY,
  },
  rowDim: { opacity: 0.5 },
  iconCell: {
    width: size.accessRowIconCell,
    height: size.accessRowIconCell,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: size.accessRowLabelFontSize, fontWeight: "700" },
  rowNote: { fontSize: size.accessRowNoteFontSize },
  track: {
    width: size.accessSwitchWidth,
    height: size.accessSwitchHeight,
    borderRadius: radius.pill,
    padding: 2,
  },
  knob: {
    width: size.accessSwitchKnob,
    height: size.accessSwitchKnob,
    borderRadius: radius.pill,
  },
  jumpTarget: {
    minWidth: size.minimumHitTarget,
    minHeight: size.minimumHitTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpChip: {
    height: size.accessStepHeight,
    paddingHorizontal: size.accessStepPaddingX,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpText: { fontSize: size.accessStepFontSize, fontWeight: "800" },
});
