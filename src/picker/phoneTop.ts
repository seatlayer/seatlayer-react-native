import { seatLayerPickerPhoneChromeTop } from './adaptiveLayoutState';
import { seatLayerPickerMapControlsEdgeInset, seatLayerPickerMapControlsRailTop } from './SeatLayerMapControls';
import { seatLayerPickerTestModeIndicatorCompactHeight } from './testModeIndicator';
import { seatLayerPickerTokens } from './tokens.g';

const size = seatLayerPickerTokens.size;

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
  floorWidth: number | undefined;
}>): Readonly<{
  badgeTop: number;
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
  const chipsTop = oneLine
    ? seatLayerPickerMapControlsRailTop + (size.viewModeControlHeight - seatLayerFloorStripHeight) / 2
    : input.controls
      ? seatLayerPickerMapControlsRailTop + size.viewModeControlHeight + size.mapAnchorGap
      : seatLayerPickerMapControlsRailTop;
  const chipsEnd = chipsTop + seatLayerFloorStripHeight;
  const topRailHeight = input.backPillDrawn
    ? input.immersiveTopInset + size.minimumHitTarget
    : Math.max(topControlsHeight, input.floorStripVisible ? chipsEnd : 0);
  // The badge shares the map's top line with the Map/3D control. The level
  // chips, or the scene's way back, push it one line down.
  const badgeTop = input.badgeCleared
    ? size.immersiveBackPillHeight + size.mapAnchorGap
    : input.floorStripVisible && !oneLine
      ? chipsEnd + size.mapAnchorGap
      : seatLayerPickerMapControlsRailTop;
  return {
    badgeTop,
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
