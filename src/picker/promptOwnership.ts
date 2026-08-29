import type { SeatLayerPickerPromptKind, SeatLayerPickerPromptState } from './presentationState';

export interface SeatLayerPickerPromptLease {
  readonly owner: string;
  readonly epoch: number;
  readonly kind: SeatLayerPickerPromptKind;
  readonly context: unknown;
}

/** One session-scoped prompt at a time; a second owner never overwrites it. */
export class SeatLayerPickerPromptOwnership {
  private active: SeatLayerPickerPromptLease | undefined;
  private nextEpoch = 0;

  claim(owner: string, kind: SeatLayerPickerPromptKind, context?: unknown): SeatLayerPickerPromptLease | undefined {
    if (typeof owner !== 'string' || typeof kind !== 'string' || !owner.trim() || this.active !== undefined) {
      return undefined;
    }
    this.nextEpoch += 1;
    this.active = Object.freeze({ owner, epoch: this.nextEpoch, kind, context });
    return this.active;
  }

  asPresentation(lease: SeatLayerPickerPromptLease): SeatLayerPickerPromptState {
    return Object.freeze({ kind: lease.kind, context: lease.context });
  }

  isActive(lease: SeatLayerPickerPromptLease): boolean {
    return this.active?.epoch === lease.epoch && this.active.owner === lease.owner;
  }

  dismiss(lease: SeatLayerPickerPromptLease): boolean {
    if (!this.isActive(lease)) return false;
    this.active = undefined;
    return true;
  }

  dismissActive(): boolean {
    if (!this.active) return false;
    this.active = undefined;
    return true;
  }

  reset(): void { this.active = undefined; }
  get current(): SeatLayerPickerPromptLease | undefined { return this.active; }
}
