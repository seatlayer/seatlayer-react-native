import { SeatLayerError } from '../errors';
import type { JsonValue } from '../json';
import type { ReadyInfo } from '../types';
import { decodeSeatLayerPickerAvailabilityOutcome, type SeatLayerPickerAvailabilityOutcome } from './availability';
import { SeatLayerPickerChartLoadSubscriptions, type SeatLayerChartLoadListener } from './chartLoadSubscription';
import { SeatLayerPickerControllerCore } from './controllerCore';
import { decodeSeatLayerPickerSnapshot } from './decode';
import type { SeatLayerPickerSnapshot } from './models';
import { validateNonEmpty, validateOptions, validatePositiveInteger } from './validation';

export type { SeatLayerPickerGACandidate } from './ga-candidate-store';
export type { SeatLayerPickerControllerOptions } from './controllerCore';

export interface SeatLayerPickerLifecycleResult {
  readonly snapshot?: SeatLayerPickerSnapshot;
  readonly outcome?: SeatLayerPickerAvailabilityOutcome;
}

/** Public picker controller; recovery additions retain the original controller identity. */
export class SeatLayerPickerController extends SeatLayerPickerControllerCore {
  private availabilityRefreshFlight: Promise<SeatLayerPickerLifecycleResult | undefined> | undefined;
  private readonly chartLoads = new SeatLayerPickerChartLoadSubscriptions(
    () => this.mapController.isReady &&
      this.mapController.supportsPickerCapability('chart-load-trace-v1') &&
      this.mapController.supportsPickerEvent('telemetry.chartLoad'),
  );
  private readonly unsubscribeChartLoad = this.mapController.on('unknownEvent', ({ name, payload }) => {
    if (name === 'telemetry.chartLoad') this.chartLoads.accept(payload);
  });

  /** Starts timing at a scope mount or accepted retry, never at construction. */
  beginChartLoadAttempt(startedAt?: number): void {
    this.chartLoads.begin(startedAt);
  }

  /** Retains only the first ready notification for the current attempt. */
  markChartLoadReady(info: ReadyInfo | undefined): void {
    this.chartLoads.markReady(info ?? this.mapController.readyInfo);
  }

  /** Future chart-load events only; subscribing never replays an earlier event. */
  subscribeChartLoad(listener: SeatLayerChartLoadListener): () => void {
    return this.chartLoads.subscribe(listener);
  }

  override dispose(): void {
    this.unsubscribeChartLoad();
    this.chartLoads.dispose();
    super.dispose();
  }

  get supportsAvailabilityRefresh(): boolean {
    return this.available('availability-refresh-v1', 'picker.refreshAvailability');
  }

  get supportsHoldSelection(): boolean {
    return this.available('hold-selection-v1', 'picker.holdSelection');
  }

  /**
   * Releases a picker-owned hold after earlier queued mutations have settled.
   * Close chrome must decide from the snapshot at its queue turn, rather than
   * one captured before a preceding selection established a hold.
   */
  releasePickerOwnedHold(): Promise<SeatLayerPickerSnapshot | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    return this.serial(async () => {
      const snapshot = this.getSnapshot();
      if (snapshot?.hold.active !== true || snapshot.hold.owner !== 'picker') {
        return snapshot;
      }
      if (!this.available('picker-actions-v1', 'picker.abort')) {
        throw SeatLayerError.incompatible(
          "The loaded picker does not advertise 'picker.abort'.",
        );
      }
      return this.applyMutationResult(await this.command('picker.abort'));
    });
  }

  lifecycle(state: string): Promise<SeatLayerPickerLifecycleResult | undefined> {
    return this.guard(
      validateNonEmpty('state', state),
      () => this.lifecycleMutation('picker.lifecycle', {
        state: state === 'resumed' || state === 'foreground' ? 'foreground' : 'background',
      }),
    );
  }

  override setLifecycle(state: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.lifecycle(state).then((result) => result?.snapshot ?? this.getSnapshot());
  }

  refreshAvailability(): Promise<SeatLayerPickerLifecycleResult | undefined> {
    if (this.availabilityRefreshFlight) return this.availabilityRefreshFlight;
    if (!this.supportsAvailabilityRefresh) return Promise.resolve(undefined);
    const flight = this.lifecycleMutation('picker.refreshAvailability');
    this.availabilityRefreshFlight = flight;
    void flight.finally(() => {
      if (this.availabilityRefreshFlight === flight) this.availabilityRefreshFlight = undefined;
    }).catch(() => {});
    return flight;
  }

  holdSelection(options: { ttlMs?: number } = {}): Promise<SeatLayerPickerSnapshot | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const error = validateOptions(options) ?? (options.ttlMs === undefined ? undefined : validatePositiveInteger('ttlMs', options.ttlMs));
    if (error) return Promise.reject(error);
    if (!this.supportsHoldSelection) return Promise.resolve(undefined);
    return this.mutation('picker.holdSelection', options.ttlMs === undefined ? undefined : { ttlMs: options.ttlMs });
  }

  private lifecycleMutation(command: string, payload?: JsonValue): Promise<SeatLayerPickerLifecycleResult | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    return this.serial(async () => {
      const raw = await this.command(command, payload);
      const supplied = decodeSnapshot(ownData(raw, 'snapshot') ?? raw);
      const revision = ownData(raw, 'revision');
      await this.applyMutationResult({
        ...(supplied ? { snapshot: supplied } : {}),
        ...(typeof revision === 'number' ? { revision } : {}),
      } as JsonValue);
      const outcome = decodeSeatLayerPickerAvailabilityOutcome(ownData(raw, 'outcome') ?? raw);
      if (!outcome && !supplied) return undefined;
      return Object.freeze({
        ...(supplied ? { snapshot: supplied } : {}),
        ...(outcome ? { outcome } : {}),
      });
    });
  }
}

function ownData(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && 'value' in descriptor ? descriptor.value : undefined; } catch { return undefined; }
}

function decodeSnapshot(value: unknown): SeatLayerPickerSnapshot | undefined {
  try {
    return decodeSeatLayerPickerSnapshot(value);
  } catch {
    return undefined;
  }
}
