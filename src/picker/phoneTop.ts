import { seatLayerPickerPhoneChromeTop } from './adaptiveLayoutState';
import { seatLayerPickerMapControlsEdgeInset, seatLayerPickerMapControlsRailTop } from './SeatLayerMapControls';
import type { SeatLayerPickerConnectionPlace } from './connectionStatus';
import { seatLayerPickerTestModeIndicatorCompactHeight } from './testModeIndicator';
import { seatLayerPickerTokens } from './tokens.g';

const size = seatLayerPickerTokens.size;
/** The way back's own start, and the least air between it and the Map/3D control. */
const backStart = 10;
const backGap = 8;

/** How tall the level chips' pill is drawn. */
const seatLayerFloorStripHeight = size.floorChipHeight + size.floorRailPadding * 2;

/** Where the pieces drawn over the top of a phone's map stand. */
export function planSeatLayerPickerPhoneTop(input: Readonly<{
  backPillDrawn: boolean;
  badgeCleared: boolean;
  /** Anything in the map's top corners: the way back, or the Map/3D control. */
  controls: boolean;
  viewModeVisible: boolean;
  floorStripVisible: boolean;
  /** The app draws the level chips itself, without their taller tap area. */
  ownFloorStrip: boolean;
  immersiveTopInset: number;
  testBadgeVisible: boolean;
  /** A phone held sideways, where one line may hold all three. */
  sideways: boolean;
  mapWidth: number;
  /** As drawn; undefined until it is measured. */
  badgeWidth: number | undefined;
  viewModeWidth: number | undefined;
  /** The scene's way back, with anything on its line; undefined until measured. */
  back: Readonly<{ width: number; height: number }> | undefined;
  floorWidth: number | undefined;
}>): Readonly<{
  /** Where the scene's way back stands. */
  backTop: number;
  badgeTop: number;
  /** Where the connection status stands: on the badge's line, after it. */
  connection: SeatLayerPickerConnectionPlace;
  floorBottom: number | undefined;
  /** The room the chips leave at the map's start and end. */
  floorRail: Readonly<{ paddingStart: number; paddingEnd: number; top: number }>;
  topHeight: number;
}> {
  const topControlsHeight = input.controls
    ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerPhoneChromeTop : 0;
  // The level chips take the map's top line, or the line under the Map/3D
  // control: they may run the map's whole width.
  // Sideways the line is theirs too where the badge, the pill and the control
  // fit on it, the pill in the map's middle or between its two neighbours.
  const edge = seatLayerPickerMapControlsEdgeInset;
  const besides = (drawn: boolean, width: number | undefined) =>
    edge + (drawn ? (width ?? Number.POSITIVE_INFINITY) + size.mapAnchorGap : 0);
  const start = besides(input.testBadgeVisible, input.badgeWidth);
  const end = besides(input.viewModeVisible, input.viewModeWidth);
  const floorWidth = input.floorWidth ?? Number.POSITIVE_INFINITY;
  const oneLine = input.sideways && !input.ownFloorStrip && !input.badgeCleared
    && start + floorWidth + end <= input.mapWidth;
  const middle = Math.max(start, end);
  const centred = floorWidth + middle * 2 <= input.mapWidth;
  // The way back shares the top line with the Map/3D control, and takes the line
  // under it where the two are wider than the map.
  const lineBelow = seatLayerPickerMapControlsRailTop + size.viewModeControlHeight + size.mapAnchorGap;
  const backTop = input.back !== undefined && input.viewModeVisible && input.viewModeWidth !== undefined
    && input.mapWidth > 0 && backStart + input.back.width + backGap + input.viewModeWidth + edge > input.mapWidth
    ? Math.max(input.immersiveTopInset, lineBelow) : input.immersiveTopInset;
  // Two lines of a long label in a large text make it taller.
  const backHeight = Math.max(size.immersiveBackPillHeight, input.back?.height ?? 0);
  const chipsTop = oneLine
    ? seatLayerPickerMapControlsRailTop + (size.viewModeControlHeight - seatLayerFloorStripHeight) / 2
    : input.controls
      ? lineBelow
      : seatLayerPickerMapControlsRailTop;
  const chipsEnd = chipsTop + seatLayerFloorStripHeight;
  const topRailHeight = input.backPillDrawn
    ? backTop + Math.max(size.minimumHitTarget, backHeight)
    : Math.max(topControlsHeight, input.floorStripVisible ? chipsEnd : 0);
  // The badge shares the map's top line with the Map/3D control. The level
  // chips, or the scene's way back, push it one line down.
  const badgeTop = input.badgeCleared
    ? backHeight + size.mapAnchorGap + backTop - input.immersiveTopInset
    : input.floorStripVisible && !oneLine
      ? chipsEnd + size.mapAnchorGap
      : seatLayerPickerMapControlsRailTop;
  // The status shares the badge's line, short of the Map/3D control where that
  // line is the control's too. Sideways, with the levels on the top line, it
  // goes under that line.
  const controlLine = !input.floorStripVisible || oneLine;
  // On the badge's own line it is centred on the badge.
  const lineTop = oneLine
    ? lineBelow
    : controlLine
      ? seatLayerPickerMapControlsRailTop
      : badgeTop - (size.connectionStatusHeight - seatLayerPickerTestModeIndicatorCompactHeight) / 2;
  const lineHeight = controlLine && !oneLine ? size.viewModeControlHeight : size.connectionStatusHeight;
  const connection: SeatLayerPickerConnectionPlace = {
    top: lineTop,
    start: oneLine ? edge : start,
    end: controlLine && !oneLine && input.viewModeVisible
      ? edge + (input.viewModeWidth ?? Number.POSITIVE_INFINITY) + size.connectionStatusSwitchGap
      : edge,
    belowTop: oneLine ? lineTop : lineTop + lineHeight + size.mapAnchorGap,
    inset: edge,
  };
  return {
    backTop,
    badgeTop,
    connection,
    floorBottom: input.floorStripVisible && !oneLine ? chipsEnd : undefined,
    floorRail: {
      paddingStart: input.ownFloorStrip ? 0 : !oneLine ? edge : centred ? middle : start,
      paddingEnd: input.ownFloorStrip ? 0 : !oneLine ? edge : centred ? middle : end,
      top: chipsTop - (input.ownFloorStrip ? 0 : (size.minimumHitTarget - seatLayerFloorStripHeight) / 2),
    },
    topHeight: Math.max(
      topRailHeight,
      input.testBadgeVisible ? badgeTop + seatLayerPickerTestModeIndicatorCompactHeight : 0,
    ),
  };
}
