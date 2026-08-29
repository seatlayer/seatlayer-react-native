import type { SeatLayerPickerController } from './controller';
import {
  seatLayerPanoramaHasContent,
  seatLayerPanoramaIsOwned,
} from './immersiveChrome';
import type { SeatLayerPickerSnapshot, SeatLayerSeatView } from './models';
import { supportsSeatLayerPickerSurface } from './surfaces';

export interface SeatLayerPickerAdaptiveChromeEligibilityInput {
  readonly controller: SeatLayerPickerController;
  readonly snapshot: SeatLayerPickerSnapshot | undefined;
  readonly seatView: SeatLayerSeatView | undefined;
  readonly enable3D: boolean;
  readonly enableSeatView: boolean;
  readonly map3D: boolean;
  readonly fit: boolean;
  readonly overview: boolean;
  readonly hasFocusedSection: boolean;
}

/** Uses the same contract legs as the standalone immersive and map surfaces. */
export function resolveSeatLayerPickerAdaptiveChromeEligibility(
  input: SeatLayerPickerAdaptiveChromeEligibilityInput,
): Readonly<{ canFit: boolean; canOverview: boolean; canSwitchView: boolean; mapControls: boolean; panorama: boolean }> {
  const { controller, snapshot } = input;
  const buyerView = snapshot?.map.buyerView;
  const mapView = buyerView === 'map';
  const validView = mapView || buyerView === 'venue3d';
  const nativeChrome = supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1'], []);
  const canSwitchView = validView && input.enable3D && input.map3D && snapshot?.capabilities.includes('venue3d') === true &&
    supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1', 'venue-3d-v1'], ['picker.setBuyerView']);
  const canFit = mapView && input.fit &&
    supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1', 'zoom'], ['picker.zoomToFit']);
  const canOverview = mapView && input.overview && input.hasFocusedSection &&
    supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1'], ['picker.overview']);
  const panorama = input.enableSeatView && seatLayerPanoramaIsOwned({
    hasContent: seatLayerPanoramaHasContent(input.seatView),
    hasSnapshotFeature: snapshot?.capabilities.includes('seatView') === true,
    nativeContract: nativeChrome,
    nativeSeatViewCapability: controller.mapController.isReady &&
      controller.mapController.supportsPickerCapability('native-seat-view-chrome-v1'),
    seatViewEvent: controller.mapController.isReady && controller.mapController.supportsPickerEvent?.('seatView.changed') === true,
  });
  return Object.freeze({ canFit, canOverview, canSwitchView, mapControls: nativeChrome && (canSwitchView || canFit || canOverview), panorama });
}
