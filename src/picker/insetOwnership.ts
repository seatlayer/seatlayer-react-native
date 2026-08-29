import type { SeatLayerPickerViewportInsetInput } from './viewportInsets';

export interface SeatLayerPickerInsetLease {
  set(insets: SeatLayerPickerViewportInsetInput): void;
  remove(): void;
}

/** Guards a named viewport band against stale mount cleanup and layout events. */
export class SeatLayerPickerInsetOwnership {
  private next = 0;
  private readonly leases = new Map<string, number>();
  constructor(
    private readonly setBand: (band: string, insets: SeatLayerPickerViewportInsetInput) => void,
    private readonly removeBand: (band: string) => void,
  ) {}

  claim(band: string): SeatLayerPickerInsetLease {
    if (typeof band !== 'string' || !band.trim()) {
      return Object.freeze({ set: () => undefined, remove: () => undefined });
    }
    const key = band.trim();
    const token = this.next + 1;
    this.next = token;
    this.leases.set(key, token);
    const current = () => this.leases.get(key) === token;
    return Object.freeze({
      set: (insets: SeatLayerPickerViewportInsetInput) => { if (current()) this.setBand(key, insets); },
      remove: () => {
        if (!current()) return;
        this.leases.delete(key);
        this.removeBand(key);
      },
    });
  }

  reset(): void {
    for (const band of this.leases.keys()) this.removeBand(band);
    this.leases.clear();
  }
}
