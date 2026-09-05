import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerAvailability } from './pickerScopeTypes';

/** What this runtime's hello table offers, as the scope publishes it. */
export function availabilityOfSeatLayerPickerController(
  controller: SeatLayerPickerController,
): SeatLayerPickerAvailability {
  return Object.freeze({
    floorStack: controller.supportsFloorStack,
    viewportInsets: controller.supportsViewportInsets,
    venue3D: controller.supportsVenue3D,
    seatView: controller.supportsSeatView,
    nativeSeatViewChrome: controller.supportsNativeSeatViewChrome,
  });
}
