import type { SeatLayerPickerController } from "./controller";

/** All lifecycle and recovery commands stay in the controller serial queue. */
export function pickerLifecycleAvailabilitySink(
  controller: SeatLayerPickerController,
): {
  setLifecycle(
    state: string,
  ): Promise<unknown>;
  refreshAvailability(): Promise<unknown>;
  synchronize(): Promise<unknown>;
} {
  return {
    setLifecycle: (state) => controller.lifecycle(state),
    refreshAvailability: () => controller.refreshAvailability(),
    synchronize: () => controller.synchronize(),
  };
}

export function reselectSeatLayerPickerLapse(
  controller: SeatLayerPickerController,
  labels: readonly string[],
  holdTtlMs?: number,
) {
  if (!labels.length) return Promise.resolve(undefined);
  return controller.selectObjects([...labels]).then(async (snapshot) => {
    if (controller.supportsHoldSelection) {
      return controller.holdSelection(
        holdTtlMs === undefined ? {} : { ttlMs: holdTtlMs },
      );
    }
    return snapshot;
  });
}
