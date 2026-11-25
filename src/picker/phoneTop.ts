import { seatLayerPickerPhoneChromeTop } from './adaptiveLayoutState';
import { seatLayerPickerMapControlsEdgeInset, seatLayerPickerMapControlsRailTop } from './SeatLayerMapControls';
import { seatLayerPickerTestModeIndicatorCompactHeight } from './testModeIndicator';
import { seatLayerPickerTokens } from './tokens.g';

const size = seatLayerPickerTokens.size;

/** Where the pieces drawn over the top of a phone's map stand. */
export function planSeatLayerPickerPhoneTop(input: Readonly<{
  backPillDrawn: boolean;
  badgeCleared: boolean;
  /** Anything in the map's top corners: the way back, or the Map/3D control. */
  controls: boolean;
  floorStripVisible: boolean;
  immersiveTopInset: number;
  testBadgeVisible: boolean;
}>): Readonly<{ badgeTop: number; floorTop: number; topHeight: number }> {
  const floorHeight = input.floorStripVisible ? size.minimumHitTarget : 0;
  const topControlsHeight = input.controls
    ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerPhoneChromeTop : 0;
  // §3.2: the price rail is a band of its own between the header and the map,
  // never floated over it — on a busy chart the seat numbers read through the
  // chip gaps and the last chip clips under the Map / 3D control.
  const floorTop = input.floorStripVisible ? Math.max(seatLayerPickerPhoneChromeTop, topControlsHeight) : 0;
  const topRailHeight = input.backPillDrawn
    ? input.immersiveTopInset + size.minimumHitTarget
    : Math.max(topControlsHeight, floorTop + floorHeight);
  // The chip stands on the map's top band, the line the Map/3D control shares,
  // and not in the map's corner: `mapAnchorInset` is the corner's inset and put
  // the chip a rung below the control it is drawn beside. Its LEFT is still the
  // corner inset. Only the immersive scene's back pill, which owns that corner,
  // pushes it down.
  const badgeTop = input.badgeCleared
    ? size.immersiveBackPillHeight + size.mapAnchorGap
    : seatLayerPickerMapControlsRailTop;
  return {
    badgeTop,
    floorTop,
    topHeight: Math.max(
      topRailHeight,
      input.testBadgeVisible ? badgeTop + seatLayerPickerTestModeIndicatorCompactHeight : 0,
    ),
  };
}
