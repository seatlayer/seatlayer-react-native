import type { SeatLayerPickerViewportInsetInput } from './viewportInsets';

/** Keeps mounted chrome bands across a controller/session replacement. */
export class SeatLayerPickerScopeInsetBands {
  private readonly bands = new Map<string, SeatLayerPickerViewportInsetInput>();

  set(band: string, insets: SeatLayerPickerViewportInsetInput): void {
    if (typeof band !== 'string' || !band.trim()) return;
    this.bands.set(band.trim(), snapshotInsets(insets));
  }

  remove(band: string): void {
    if (typeof band !== 'string' || !band.trim()) return;
    this.bands.delete(band.trim());
  }

  clear(): void { this.bands.clear(); }

  replay(target: { setBand(band: string, insets: SeatLayerPickerViewportInsetInput): void }): void {
    for (const [band, insets] of this.bands) target.setBand(band, insets);
  }
}

function snapshotInsets(value: unknown): SeatLayerPickerViewportInsetInput {
  const ownFinite = (key: 'top' | 'right' | 'bottom' | 'left'): number => {
    if (!value || typeof value !== 'object') return 0;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const candidate = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      return typeof candidate === 'number' && Number.isFinite(candidate)
        ? Math.max(0, candidate)
        : 0;
    } catch { return 0; }
  };
  return Object.freeze({
    top: ownFinite('top'), right: ownFinite('right'),
    bottom: ownFinite('bottom'), left: ownFinite('left'),
  });
}
