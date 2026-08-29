import type { SeatLayerPickerAvailabilityOutcome } from './availability';
import {
  holdLapseFromOutcome,
  preferHoldLapse,
  type SeatLayerPickerHoldLapse,
} from './holdLapse';
import type { SeatLayerPickerSnapshot } from './models';

/** Session-local hold-lapse state. It never infers expiry from a local timer. */
export class SeatLayerPickerScopeHoldLapse {
  private current: SeatLayerPickerHoldLapse | undefined;
  private visible = true;
  private epoch = 0;
  private floorRevision = -1;

  reset(): undefined {
    this.current = undefined;
    this.visible = true;
    this.epoch = 0;
    this.floorRevision = -1;
    return undefined;
  }

  accept(
    outcome: SeatLayerPickerAvailabilityOutcome,
    configuredHoldTtlMs?: unknown,
    snapshotRevision?: number,
  ): SeatLayerPickerHoldLapse | undefined {
    const candidate = holdLapseFromOutcome(outcome, configuredHoldTtlMs);
    if (!candidate) return this.value;
    const keyed = Object.freeze({
      ...candidate,
      key: this.current?.key ?? `hold-lapse-${++this.epoch}`,
    });
    const next = preferHoldLapse(this.current, keyed);
    this.floorRevision = Math.max(
      this.floorRevision,
      outcome.revision ?? -1,
      snapshotRevision ?? -1,
    );
    if (next !== this.current) {
      this.current = next;
    }
    return this.value;
  }

  dismiss(): undefined {
    this.visible = false;
    return undefined;
  }

  /** Consumes only the exact visible offer before a recovery command starts. */
  consume(key: string): boolean {
    if (!this.visible || this.current?.key !== key) return false;
    this.visible = false;
    return true;
  }

  matches(key: string): boolean {
    return this.current?.key === key;
  }

  /** A later, active runtime hold begins a new epoch and retires this notice. */
  observeSnapshot(snapshot: SeatLayerPickerSnapshot | undefined): SeatLayerPickerHoldLapse | undefined {
    if (
      this.current !== undefined && snapshot?.hold.active === true &&
      snapshot.revision > this.floorRevision
    ) {
      this.current = undefined;
      this.visible = true;
      this.floorRevision = -1;
    }
    return this.value;
  }

  get value(): SeatLayerPickerHoldLapse | undefined {
    return this.visible ? this.current : undefined;
  }

  get holdLapsed(): boolean {
    return this.current !== undefined;
  }
}
