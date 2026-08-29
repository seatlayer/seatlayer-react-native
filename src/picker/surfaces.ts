import type { SeatLayerPickerController } from "./controller";

/** A native control requires readiness, every capability, and every command. */
export function supportsSeatLayerPickerSurface(
  controller: SeatLayerPickerController,
  capabilities: readonly string[],
  commands: readonly string[],
): boolean {
  return controller.mapController.isReady &&
    capabilities.every((capability) =>
      controller.mapController.supportsPickerCapability(capability)
    ) &&
    commands.every((command) =>
      controller.mapController.supportsPickerCommand(command)
    );
}

export function supportsSeatLayerPickerNativeChrome(
  controller: SeatLayerPickerController,
): boolean {
  return supportsSeatLayerPickerSurface(
    controller,
    ["native-chrome-contract-v1"],
    [],
  );
}
