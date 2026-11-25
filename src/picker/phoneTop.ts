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
  floorStripVisible: boolean;
  /** The app draws the level chips itself, without their taller tap area. */
  ownFloorStrip: boolean;
  immersiveTopInset: number;
  testBadgeVisible: boolean;
}>): Readonly<{ badgeTop: number; floorBottom: number | undefined; floorTop: number; topHeight: number }> {
  const topControlsHeight = input.controls
    ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerPhoneChromeTop : 0;
  // The level chips take the map's top line, or the line under the Map/3D
  // control: they may run the map's whole width.
  const chipsTop = input.controls
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
    : input.floorStripVisible
      ? chipsEnd + size.mapAnchorGap
      : seatLayerPickerMapControlsRailTop;
  return {
    badgeTop,
    floorBottom: input.floorStripVisible ? chipsEnd : undefined,
    floorTop: chipsTop - (input.ownFloorStrip ? 0 : (size.minimumHitTarget - seatLayerFloorStripHeight) / 2),
    topHeight: Math.max(
      topRailHeight,
      input.testBadgeVisible ? badgeTop + seatLayerPickerTestModeIndicatorCompactHeight : 0,
    ),
  };
}
