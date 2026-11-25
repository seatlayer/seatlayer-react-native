import React, { useMemo, useState } from "react";
import {
  type GestureResponderEvent, I18nManager, Pressable, ScrollView,
  StyleSheet, Text, type TextStyle, useWindowDimensions, View,
} from "react-native";

import { SeatLayerPickerAccessIcon } from "./accessibilityIcon";
import { SeatLayerPickerSeatIcon, seatLayerPickerHasSeatIcon } from "./seatIcons";
import { seatLayerPickerColorAlpha } from "./colors";
import { seatLayerPickerTabletShortestSide } from "./options";
import { SeatLayerPickerPromptModal } from "./promptModal";
import { normalizeSeatLayerPickerSafeAreaInsets, type SeatLayerPickerSafeAreaInsets } from "./safeAreaInsets";
import type { SeatLayerPickerStyles } from "./styles";
import type { SeatLayerPickerThemeData } from "./theme";
import { seatLayerPickerTokens } from "./tokens.g";
import { seatLayerPickerBoldStyles } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';

/** iOS starts a line at the side its own language reads from, not the layout's. */
const readingSide = (): TextStyle | null => (I18nManager.isRTL ? { writingDirection: "rtl" } : null);

const size = seatLayerPickerTokens.size;
const radius = seatLayerPickerTokens.radius;

/** One height for every row whose name fits; a name that does not wraps, and its row grows. */
const rowHeight = 50;
/** What keeps a name off its hairlines once its row has grown. */
const rowLabelPadY = 6;
const rowLabelLine = size.accessRowLabelFontSize * 1.25;
/** Past this text size a count stands under its name: beside it neither had room. */
const countUnderNameScale = 1.3;
const headingFontSize = 20;
const headingLine = headingFontSize * 1.25;
const headingPadTop = 8;
const groupTitleFontSize = 11;
const groupTitleLine = 16;
const groupTitlePadTop = 18;
const groupTitlePadBottom = 4;
const sheetPadBottom = 20;
const listPadBottom = 4;

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
  /** The heading over the provisions, in the capitals its translator wrote. */
  readonly needsTitle: string;
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

export interface SeatLayerPickerAccessSheetRoom {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly topInset: number;
  readonly bottomInset: number;
  /** How many map switches stand over the kinds of seat. */
  readonly switches: number;
  readonly fontScale: number;
}

/** What stands over the kinds of seat, and one row of them, at a text size. */
function aboveTheList(room: SeatLayerPickerAccessSheetRoom): Readonly<{ above: number; row: number }> {
  const scale = Math.max(1, Number.isFinite(room.fontScale) ? room.fontScale : 1);
  const large = scale > countUnderNameScale;
  // Large words wrap on a phone held upright.
  const lines = large && room.screenWidth < seatLayerPickerTabletShortestSide ? 2 : 1;
  const name = rowLabelLine * scale;
  return {
    above: size.minimumHitTarget + Math.max(size.minimumHitTarget, headingLine * lines * scale + headingPadTop)
      + room.switches * Math.max(rowHeight, name * lines + rowLabelPadY * 2)
      + groupTitleLine * scale + groupTitlePadTop + groupTitlePadBottom,
    row: Math.max(rowHeight, name + rowLabelPadY * 2 + (large ? size.accessRowNoteFontSize * 1.2 * scale + rowLabelPadY : 0)),
  };
}

/**
 * Whether the switches scroll with the list.
 *
 * On a screen too short for both, a sideways phone most of all, the list had no
 * room left under what stands over it. There, all of it scrolls under the title.
 */
export function seatLayerPickerAccessSheetScrollsWhole(room: SeatLayerPickerAccessSheetRoom): boolean {
  const { above, row } = aboveTheList(room);
  return seatLayerPickerAccessSheetMaxHeight(room.screenHeight) - above - room.bottomInset - sheetPadBottom < row * 2;
}

/**
 * How tall the sheet may grow where all of it scrolls: the nearest height that
 * cuts a row in half, so a list that runs on is seen to.
 */
export function seatLayerPickerAccessSheetWholeHeight(room: SeatLayerPickerAccessSheetRoom): number {
  const bound = seatLayerPickerAccessSheetMaxHeight(room.screenHeight);
  const { above, row } = aboveTheList(room);
  const rows = Math.max(0, Math.floor((bound - above) / row + .25)) + .5;
  return Math.min(above + rows * row, Math.max(bound, room.screenHeight - room.topInset - size.minimumHitTarget));
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
  const window = useWindowDimensions();
  const room: SeatLayerPickerAccessSheetRoom = {
    screenWidth: window.width,
    screenHeight: props.screenHeight,
    topInset: insets.top,
    bottomInset: insets.bottom,
    switches: props.switchRows.length,
    fontScale: window.fontScale,
  };
  const scrollsWhole = seatLayerPickerAccessSheetScrollsWhole(room);
  const scrolls = props.needRows.length > 0 || scrollsWhole;
  // The strip and the foot are room after the last row, so the list is seen to
  // run on to the sheet's edge.
  const foot = insets.bottom + sheetPadBottom;
  const over = (
    <>
      {props.switchRows.map((row) => (
        <AccessRow key={row.key} row={row} {...rowProps} />
      ))}
      {props.needRows.length > 0
        ? (
          <Text
            accessibilityRole="header"
            style={[styles.groupTitle, props.switchRows.length > 0 ? styles.groupTitleUnder : null, readingSide(), {
              color: props.theme.colors.mutedText,
              fontFamily: props.theme.fontFamily,
            }]}
          >
            {props.needsTitle}
          </Text>
        )
        : null}
    </>
  );
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
                maxHeight: scrollsWhole
                  ? seatLayerPickerAccessSheetWholeHeight(room)
                  : seatLayerPickerAccessSheetMaxHeight(props.screenHeight),
                backgroundColor: props.theme.colors.surface,
                borderColor: props.theme.colors.divider,
                paddingBottom: scrolls ? 0 : foot,
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
              style={[styles.heading, readingSide(), {
                color: props.theme.colors.text,
                fontFamily: props.theme.fontFamily,
              }, props.slots.accessibilityControlLabel]}
            >
              {props.title}
            </Text>
            {/* The two map switches come first and the provisions sit under
                their own heading, so the switches never read as two more
                provisions at the foot of the list. Only the list scrolls, where
                the screen has room for it. */}
            {scrollsWhole ? null : over}
            {scrolls
              ? (
                <ScrollView
                  contentContainerStyle={{ paddingBottom: foot + listPadBottom }}
                  style={styles.listBox}
                >
                  {scrollsWhole ? over : null}
                  {props.needRows.map((row) => (
                    <AccessRow key={row.key} row={row} {...rowProps} />
                  ))}
                </ScrollView>
              )
              : null}
          </Pressable>
        </View>
      </View>
    </SeatLayerPickerPromptModal>
  );
}

/**
 * The row's glyph, from the SHARED per-attribute set (§3.8.9).
 *
 * The same drawing the seat card puts on its note bands: a sheet with its own
 * icons meant one seat wore a different mark depending on where the buyer met
 * it. The set covers the twelve accommodation keys and `contrast`; a key it
 * does not know keeps the upright seated figure rather than drawing nothing,
 * because this row still has a name and a switch to line up beside.
 */
function AccessRowGlyph(props: Readonly<{
  iconKey: string;
  color: string;
  size: number;
}>): React.ReactElement {
  if (seatLayerPickerHasSeatIcon(props.iconKey)) {
    return <SeatLayerPickerSeatIcon
      color={props.color}
      iconKey={props.iconKey}
      size={props.size}
    />;
  }
  return <SeatLayerPickerAccessIcon color={props.color} size={props.size} variant="iso" />;
}

/** The count column at its narrowest, right-aligned, wide enough for "999 free". */
const countColumn = 68;
/** The ⓘ column. */
const noteColumn = 36;
/** The row's own names for its two extra answers, in the actions rotor. */
const accessRowNoteAction = "seatlayer-access-note";
const accessRowJumpAction = "seatlayer-access-jump";
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
  const countUnder = useWindowDimensions().fontScale > countUnderNameScale;
  const jumpable = row.countLabel !== undefined && row.jumpable && !row.disabled;
  /**
   * The ⓘ and the count-as-jump, AS ACTIONS ON THE ROW.
   *
   * The whole row is the switch, so the row is one accessibility element — and
   * a touch target nested inside one is not reachable on iOS at all: the ⓘ and
   * the jump chip drawn inside the row would be a button a buyer using
   * VoiceOver can see the ink of and never reach. Flutter says
   * `explicitChildNodes` and keeps them as child nodes; React Native has no
   * such switch, so the two are offered where the platform already puts a
   * control's second and third answers — the actions rotor. The pointer keeps
   * the drawn buttons; neither route is the only one.
   */
  const actions = useMemo(() => {
    const list: { name: string; label: string }[] = [];
    if (row.note !== undefined && row.note.length > 0) {
      list.push({ name: accessRowNoteAction, label: row.note });
    }
    if (jumpable) {
      list.push({ name: accessRowJumpAction, label: row.jumpLabel ?? row.countLabel ?? "" });
    }
    return list.length === 0 ? undefined : Object.freeze(list);
  }, [jumpable, row.countLabel, row.jumpLabel, row.note]);
  const count = row.countLabel === undefined
    ? null
    : jumpable
      ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${row.label}, ${row.countLabel}, ${row.jumpLabel ?? ""}`}
          onPress={() => props.onJump(row)}
          style={styles.jumpTarget}
        >
          {/* A QUIET GROUND, not the accent: the figure is a fact
              first and a button second, and twelve pink pills
              down a sheet were the loudest thing on it. */}
          <View
            accessible={false}
            style={[styles.jumpChip, {
              backgroundColor: seatLayerPickerColorAlpha(theme.colors.text, .06),
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
      );
  return (
    <View style={styles.rowWrap}>
      <Pressable
        accessibilityActions={actions}
        accessibilityRole="switch"
        accessibilityLabel={row.label}
        accessibilityState={{ checked: row.on, disabled: row.disabled }}
        disabled={row.disabled}
        onAccessibilityAction={actions === undefined
          ? undefined
          : (event: { nativeEvent: { actionName: string } }) => {
            if (event.nativeEvent.actionName === accessRowNoteAction) setNoteOpen((open) => !open);
            if (event.nativeEvent.actionName === accessRowJumpAction && jumpable) props.onJump(row);
          }}
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
            it, not the switch at the far end. A name that does not fit wraps:
            it is never cut. */}
        <View style={styles.labelCell}>
          <View style={styles.labelLine}>
            <Text
              style={[styles.rowLabel, readingSide(), {
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
          {countUnder && count !== null ? <View style={styles.countUnder}>{count}</View> : null}
        </View>
        {/* The count keeps its OWN column so every figure lines up down the
            sheet, and `accessRowSwitchGap` holds it clear of the switch. */}
        {countUnder || (count === null && !row.reserveCountSlot)
          ? null
          : <View style={styles.countCell}>{count}</View>}
        <View accessible={false} style={styles.switchGap} />
        <View
          accessible={false}
          style={[styles.track, {
            backgroundColor: row.on
              ? theme.colors.accent
              : seatLayerPickerColorAlpha(theme.colors.mutedText, .32),
            justifyContent: row.on ? "flex-end" : "flex-start",
          }]}
        >
          <View style={[styles.knob, { backgroundColor: theme.colors.surface }]} />
        </View>
      </Pressable>
      {/* The sentence opens UNDER the row it explains rather than inside it,
          so the line is a line whether or not the buyer has asked for it. */}
      {row.note && noteOpen
        ? (
          <Text
            accessible={false}
            style={[styles.noteText, readingSide(), {
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
  heading: {
    flexShrink: 0,
    fontSize: headingFontSize,
    fontWeight: "800",
    lineHeight: headingLine,
    minHeight: size.minimumHitTarget,
    paddingTop: headingPadTop,
  },
  listBox: { flexGrow: 0, flexShrink: 1 },
  groupTitle: {
    fontSize: groupTitleFontSize,
    fontWeight: "700",
    letterSpacing: groupTitleFontSize * size.accessGroupHeadingTracking,
    lineHeight: groupTitleLine,
    paddingBottom: groupTitlePadBottom,
    paddingHorizontal: 8,
  },
  groupTitleUnder: { paddingTop: groupTitlePadTop },
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
  labelCell: { flex: 1 },
  labelLine: { flexDirection: "row", alignItems: "center" },
  rowLabel: {
    flexShrink: 1,
    fontSize: size.accessRowLabelFontSize,
    fontWeight: "600",
    lineHeight: rowLabelLine,
    paddingVertical: rowLabelPadY,
  },
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
  countCell: { minWidth: countColumn, alignItems: "flex-end", justifyContent: "center" },
  countUnder: { alignItems: "flex-start", paddingBottom: rowLabelPadY },
  countText: { fontSize: size.accessRowNoteFontSize, fontWeight: "800" },
  switchGap: { width: size.accessRowSwitchGap },
  track: {
    flexDirection: "row",
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
    minHeight: size.accessStepHeight,
    paddingHorizontal: size.accessStepPaddingX,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
}));
