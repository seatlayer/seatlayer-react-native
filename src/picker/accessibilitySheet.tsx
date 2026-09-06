import React, { useState } from "react";
import {
  type GestureResponderEvent, I18nManager, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";

import { SeatLayerPickerAccessIcon, SeatLayerPickerContrastIcon } from "./accessibilityIcon";
import { seatLayerPickerColorAlpha } from "./colors";
import { SeatLayerPickerPromptModal } from "./promptModal";
import { normalizeSeatLayerPickerSafeAreaInsets, type SeatLayerPickerSafeAreaInsets } from "./safeAreaInsets";
import type { SeatLayerPickerStyles } from "./styles";
import type { SeatLayerPickerThemeData } from "./theme";
import { seatLayerPickerTokens } from "./tokens.g";
import { seatLayerPickerBoldStyles } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';

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
  /**
   * Which of the shared per-attribute drawings this row wears, BY THE
   * RUNTIME'S OWN KEY (§3.5, Flutter 0.9.0). One wheelchair standing for
   * twelve different provisions told the buyer nothing about which row was
   * which, so a provision row takes the same mark the seat itself carries;
   * the limited-view switch wears `restrictedView`, and the colour row wears
   * `contrast`, which is authored beside the shared set rather than in it.
   */
  readonly iconKey: string;
  /**
   * Whether the row keeps an empty count column so every figure lines up down
   * the sheet. The provision rows do; the two View switches do not.
   */
  readonly reserveCountSlot: boolean;
  /** Whether a hairline closes the row. The last row of a group has none. */
  readonly hairline: boolean;
}

export interface SeatLayerPickerAccessSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly closeLabel: string;
  /** The heading over the two map switches — `strings.viewGroupTitle`. */
  readonly viewGroupTitle: string;
  readonly theme: SeatLayerPickerThemeData;
  readonly slots: SeatLayerPickerStyles;
  readonly safeAreaInsets: SeatLayerPickerSafeAreaInsets;
  /** The screen the sheet is bounded against, in points. */
  readonly screenHeight: number;
  readonly needRows: readonly SeatLayerPickerAccessSheetRow[];
  readonly switchRows: readonly SeatLayerPickerAccessSheetRow[];
  readonly onToggle: (row: SeatLayerPickerAccessSheetRow) => void;
  readonly onJump: (row: SeatLayerPickerAccessSheetRow) => void;
  /** The scrim and the drag handle. Neither moves the camera. */
  readonly onDismiss: () => void;
}

/**
 * How tall the sheet may grow, given the room the screen has.
 *
 * BOUNDED, AND IT SCROLLS INSIDE THE BOUND (§3.5). A chart carrying the whole
 * vocabulary gives this sheet twelve accommodation rows plus the limited-view
 * and colourblind switches, and an unbounded sheet answers that by taking the
 * entire screen — the map the buyer is filtering disappears behind the filter.
 * The floor keeps a short phone from being handed a sliver, and the screen
 * itself is the last word so the floor can never exceed it.
 */
export function seatLayerPickerAccessSheetMaxHeight(screenHeight: number): number {
  const room = Number.isFinite(screenHeight) && screenHeight > 0 ? screenHeight : 0;
  const bound = room * size.accessSheetMaxHeightFraction;
  const floored = bound < size.accessSheetMinHeight ? size.accessSheetMinHeight : bound;
  return floored > room ? room : floored;
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
  const rowProps = {
    theme: props.theme,
    slots: props.slots,
    onToggle: props.onToggle,
    onJump: props.onJump,
  };
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
          // The sheet reaches the bottom and both edges: a bottom sheet floated
          // in from the sides reads as a dialog, and the one it opens from is a
          // control in the map's own corner.
          style={[styles.bounds, {
            paddingTop: insets.top + 16,
            paddingRight: insets.right,
            paddingLeft: insets.left,
          }]}
        >
          <Pressable
            accessible={false}
            onPress={(event: GestureResponderEvent) => event.stopPropagation()}
            style={[
              styles.sheet,
              {
                // The bound is measured against the screen, never against the
                // content: twelve rows must scroll, not grow.
                maxHeight: seatLayerPickerAccessSheetMaxHeight(props.screenHeight),
                backgroundColor: props.theme.colors.surface,
                borderColor: props.theme.colors.divider,
                paddingBottom: insets.bottom + 20,
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
            {/* ONLY the provision list scrolls. The View group is a fixed foot
                under it, so the two map switches never scroll out of reach of
                a buyer who is twelve rows down the vocabulary. */}
            {props.needRows.length > 0
              ? (
                <ScrollView
                  contentContainerStyle={styles.list}
                  style={styles.listBox}
                >
                  {props.needRows.map((row) => (
                    <AccessRow key={row.key} row={row} {...rowProps} />
                  ))}
                </ScrollView>
              )
              : null}
            {props.switchRows.length > 0
              ? (
                <Text
                  accessibilityRole="header"
                  style={[styles.groupTitle, {
                    color: props.theme.colors.mutedText,
                    fontFamily: props.theme.fontFamily,
                  }]}
                >
                  {props.viewGroupTitle}
                </Text>
              )
              : null}
            {props.switchRows.map((row) => (
              <AccessRow key={row.key} row={row} {...rowProps} />
            ))}
          </Pressable>
        </View>
      </View>
    </SeatLayerPickerPromptModal>
  );
}

/**
 * PLACEHOLDER for the shared per-attribute icon set (§3.8.9), which Lane A
 * builds as `seatIcons.tsx` with exactly this prop contract
 * (`{ iconKey, color, size }`). Until that file lands, every provision key
 * falls back to the upright seated figure and `contrast` to the split disc,
 * which is what this sheet drew before the set existed. Swap the two lines
 * below for `<SeatLayerSeatIcon … />` at integration; nothing else moves.
 */
export const seatLayerPickerAccessRowGlyphIsPlaceholder = true;

function AccessRowGlyph(props: Readonly<{
  iconKey: string;
  color: string;
  size: number;
}>): React.ReactElement {
  return props.iconKey === 'contrast'
    ? <SeatLayerPickerContrastIcon color={props.color} size={props.size} />
    : <SeatLayerPickerAccessIcon color={props.color} size={props.size} variant="iso" />;
}

/** One height for every row, whatever it carries. */
const rowHeight = 50;
/** The count column, right-aligned, wide enough for "999 free". */
const countColumn = 68;
/** The ⓘ column. */
const noteColumn = 36;
/** A row that cannot be turned on is dimmed rather than removed. */
const disabledRowOpacity = .58;
/** How faint the hairline under a row is drawn. */
const rowHairlineAlpha = .35;

function AccessRow(props: Readonly<{
  row: SeatLayerPickerAccessSheetRow;
  theme: SeatLayerPickerThemeData;
  slots: SeatLayerPickerStyles;
  onToggle: (row: SeatLayerPickerAccessSheetRow) => void;
  onJump: (row: SeatLayerPickerAccessSheetRow) => void;
}>): React.ReactElement {
  const { row, theme } = props;
  const [noteOpen, setNoteOpen] = useState(false);
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
          row.hairline
            ? {
              borderBottomWidth: seatLayerPickerLineWidth,
              borderBottomColor: seatLayerPickerColorAlpha(theme.colors.divider, rowHairlineAlpha),
            }
            : null,
          props.slots.accessibilityNeedButton,
          row.disabled ? { opacity: disabledRowOpacity } : null,
        ]}
      >
        <View accessible={false} style={styles.iconCell}>
          <AccessRowGlyph
            iconKey={row.iconKey}
            color={theme.colors.mutedText}
            size={size.accessRowIconSize}
          />
        </View>
        {/* The label and its ⓘ share ONE cell: the ⓘ explains the words beside
            it, not the switch at the far end. The label is one line and
            truncates — a translation that runs long shortens rather than
            wrapping, so twelve rows stay twelve lines on any phone. */}
        <View style={styles.labelCell}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.rowLabel, {
              color: theme.colors.text,
              fontFamily: theme.fontFamily,
            }, props.slots.accessibilityNeedText]}
          >
            {row.label}
          </Text>
          {row.note
            ? (
              <View style={styles.noteCell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={row.note}
                  accessibilityState={{ expanded: noteOpen }}
                  onPress={() => setNoteOpen((open) => !open)}
                  style={styles.noteTarget}
                >
                  <SeatLayerPickerInfoIcon
                    color={noteOpen ? theme.colors.accent : theme.colors.mutedText}
                    size={size.accessNoteIconSize}
                  />
                </Pressable>
              </View>
            )
            : null}
        </View>
        {/* The count keeps its OWN column so every figure lines up down the
            sheet, and `accessRowSwitchGap` holds it clear of the switch. */}
        {row.countLabel !== undefined || row.reserveCountSlot
          ? (
            <View style={styles.countCell}>
              {row.countLabel === undefined
                ? null
                : row.jumpable && !row.disabled
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
                          style={[styles.countText, {
                            color: theme.colors.text,
                            fontFamily: theme.fontFamily,
                          }]}
                        >
                          {row.countLabel}
                        </Text>
                      </View>
                    </Pressable>
                  )
                  : (
                    // Ink, not the accent: twelve red figures down a list read
                    // as twelve warnings.
                    <Text
                      style={[styles.countText, {
                        color: theme.colors.mutedText,
                        fontFamily: theme.fontFamily,
                      }]}
                    >
                      {row.countLabel}
                    </Text>
                  )}
            </View>
          )
          : null}
        <View accessible={false} style={styles.switchGap} />
        <View
          accessible={false}
          style={[styles.track, {
            backgroundColor: row.on
              ? theme.colors.accent
              : seatLayerPickerColorAlpha(theme.colors.mutedText, .32),
            flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
          }]}
        >
          <View
            style={[styles.knob, {
              backgroundColor: theme.colors.surface,
              transform: [{
                translateX: row.on
                  ? (I18nManager.isRTL ? -knobTravel : knobTravel)
                  : 0,
              }],
            }]}
          />
        </View>
      </Pressable>
      {/* The sentence opens UNDER the row it explains rather than inside it,
          so the line is a line whether or not the buyer has asked for it. */}
      {row.note && noteOpen
        ? (
          <Text
            accessible={false}
            style={[styles.noteText, {
              color: theme.colors.mutedText,
              fontFamily: theme.fontFamily,
            }]}
          >
            {row.note}
          </Text>
        )
        : null}
    </View>
  );
}

/** The ⓘ, drawn rather than typed for the same reason the wheelchair is. */
function SeatLayerPickerInfoIcon({ color, size: glyph }: Readonly<{
  color: string;
  size: number;
}>): React.ReactElement {
  return (
    <View
      accessible={false}
      style={{
        alignItems: 'center',
        borderColor: color,
        borderRadius: glyph / 2,
        borderWidth: seatLayerPickerLineWidth * 1.5,
        height: glyph,
        justifyContent: 'center',
        width: glyph,
      }}
    >
      <View style={{
        backgroundColor: color,
        borderRadius: glyph / 12,
        height: glyph / 8,
        marginBottom: glyph / 12,
        width: glyph / 8,
      }} />
      <View style={{
        backgroundColor: color,
        borderRadius: glyph / 12,
        height: glyph / 3,
        width: glyph / 8,
      }} />
    </View>
  );
}

const knobTravel = size.accessSwitchWidth - size.accessSwitchKnob -
  (size.accessSwitchHeight - size.accessSwitchKnob);

const styles = seatLayerPickerBoldStyles(StyleSheet.create({
  scrim: { flex: 1 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  bounds: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderWidth: seatLayerPickerLineWidth,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 20,
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
  listBox: { flexGrow: 0, flexShrink: 1 },
  list: { paddingBottom: 4 },
  groupTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: .6,
    paddingBottom: 4,
    paddingHorizontal: 8,
    paddingTop: 18,
  },
  rowWrap: { alignSelf: "stretch" },
  row: {
    minHeight: rowHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: size.accessRowPaddingX,
  },
  iconCell: {
    width: size.accessRowIconCell,
    height: size.accessRowIconCell,
    alignItems: "center",
    justifyContent: "center",
    marginRight: size.accessRowGap,
  },
  labelCell: { flex: 1, flexDirection: "row", alignItems: "center" },
  rowLabel: { flexShrink: 1, fontSize: size.accessRowLabelFontSize, fontWeight: "600" },
  noteCell: { width: noteColumn, alignItems: "center", justifyContent: "center" },
  noteTarget: {
    minWidth: size.minimumHitTarget,
    minHeight: size.minimumHitTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  noteText: {
    fontSize: size.accessRowNoteFontSize,
    fontWeight: "600",
    paddingBottom: size.accessRowPaddingY,
    paddingLeft: size.accessRowIconCell + size.accessRowGap + size.accessRowPaddingX,
    paddingRight: size.accessRowPaddingX,
  },
  countCell: { width: countColumn, alignItems: "flex-end", justifyContent: "center" },
  countText: { fontSize: size.accessRowNoteFontSize, fontWeight: "800" },
  switchGap: { width: size.accessRowSwitchGap },
  track: {
    width: size.accessSwitchWidth,
    height: size.accessSwitchHeight,
    borderRadius: radius.pill,
    padding: (size.accessSwitchHeight - size.accessSwitchKnob) / 2,
  },
  knob: {
    width: size.accessSwitchKnob,
    height: size.accessSwitchKnob,
    borderRadius: radius.pill,
  },
  jumpTarget: {
    minHeight: size.minimumHitTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpChip: {
    height: size.accessStepHeight,
    paddingHorizontal: size.accessStepPaddingX,
    borderRadius: radius.pill,
    borderWidth: seatLayerPickerLineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
}));
