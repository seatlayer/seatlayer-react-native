/**
 * Holds the instance created by the current React effect setup.
 *
 * React Strict Mode cleans an effect up and immediately runs a fresh setup;
 * cleanup must therefore retire only its own instance, never the next setup.
 */
export class SeatLayerPickerEffectSlot<Instance extends { dispose(): void }> {
  current: Instance | undefined;

  install(instance: Instance): () => void {
    this.current = instance;
    return () => {
      if (this.current === instance) this.current = undefined;
      instance.dispose();
    };
  }
}
