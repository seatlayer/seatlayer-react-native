import { SeatLayerError } from '../errors';
import type { JsonObject, JsonValue } from '../json';

import type { ReadyInfo, SeatLayerConfiguration } from '../types';
import {
  decodeSeatLayerPickerAvailabilityOutcome,
  seatLayerAvailabilityRefreshCapability,
  seatLayerHoldSelectionCapability,
  type SeatLayerPickerAvailabilityOutcome,
} from './availability';
import { SeatLayerPickerChartLoadSubscriptions, type SeatLayerChartLoadListener } from './chartLoadSubscription';
import { SeatLayerPickerControllerCore } from './controllerCore';
import {
  seatLayerHostPricesPayload,
  seatLayerHostPricingCapability,
  seatLayerMarkBookedCapability,
  seatLayerMarkBookedCommand,
  seatLayerSetPricingCommand,
} from './hostPricing';
import type { SeatLayerPickerPricing } from './options';
import {
  SeatLayerPickerPageRecovery,
  seatLayerPickerResumeRetryMs,
  seatLayerPickerUnanswered,
  type SeatLayerPickerReloadHold,
} from './pageRecovery';
import {
  SeatLayerPickerBookedDetector,
  seatLayerPickerHoldOwnershipStore,
} from './holdOwnership';
import {
  decodeSeatLayerPickerAccessibleSectionStep,
  decodeSeatLayerPickerFrameSeatResult,
  decodeSeatLayerPickerSeatRetap,
  decodeSeatLayerPickerSnapshot,
} from './decode';
import type {
  SeatLayerPickerAccessibleSectionStep,
  SeatLayerPickerBlockedRegion,
  SeatLayerPickerCheckoutHandoff,
  SeatLayerPickerFrameSeatOptions,
  SeatLayerPickerFrameSeatResult,
  SeatLayerPickerSelectedSeat,
  SeatLayerPickerSnapshot,
} from './models';
import {
  seatLayerAccessibilityFocusCapability,
  seatLayerFocusAccessibilityFilterCommand,
  seatLayerFocusNextAccessibleSectionCommand,
  seatLayerFrameSeatCommand,
  seatLayerSeatRetapEvent,
  seatLayerSetBlockedRegionsCommand,
  seatLayerSetSelectionFocusCommand,
} from '../bridge/protocol';
import { validateNonEmpty, validateOptions, validatePositiveInteger, validateStrings } from './validation';

export type SeatLayerPickerSeatRetapListener = (
  seat: SeatLayerPickerSelectedSeat,
) => void;

export type SeatLayerPickerBookedListener = (
  handoff: SeatLayerPickerCheckoutHandoff,
) => void;

function badPayload(message: string): SeatLayerError {
  return new SeatLayerError('bad_payload', message);
}

/**
 * The runtime replaces the whole list on every call and fails a malformed
 * rectangle rather than dropping it, so a shell that mis-serialised one disc
 * cannot silently lose that disc's guard. This mirrors that: one bad rectangle
 * rejects the call.
 */
function blockedRegionPayload(
  regions: readonly SeatLayerPickerBlockedRegion[] | null | undefined,
): JsonValue {
  if (regions === null || regions === undefined) return { rects: null };
  if (!Array.isArray(regions)) {
    throw badPayload('SeatLayer blocked regions must be an array.');
  }
  return {
    rects: regions.map((region, index) => {
      const side = (key: 'x' | 'y' | 'w' | 'h'): number => {
        const value = (region as Record<string, unknown> | null)?.[key];
        if (
          typeof value !== 'number' || !Number.isFinite(value) ||
          ((key === 'w' || key === 'h') && value < 0)
        ) {
          throw badPayload(
            `SeatLayer blocked region ${index} needs a finite ${key}${
              key === 'w' || key === 'h' ? ' of at least 0' : ''
            }.`,
          );
        }
        return value;
      };
      return { x: side('x'), y: side('y'), w: side('w'), h: side('h') };
    }),
  };
}

export type { SeatLayerPickerGACandidate } from './ga-candidate-store';
export type { SeatLayerPickerControllerOptions } from './controllerCore';

export interface SeatLayerPickerLifecycleResult {
  readonly snapshot?: SeatLayerPickerSnapshot;
  readonly outcome?: SeatLayerPickerAvailabilityOutcome;
}

/** A hold asked for again on a replaced page, until the answer is final. */
interface SeatLayerPickerResume {
  readonly holdId: string;
  timer?: ReturnType<typeof setTimeout> | undefined;
}

/** Public picker controller; recovery additions retain the original controller identity. */
export class SeatLayerPickerController extends SeatLayerPickerControllerCore {
  private reloadGenerationValue = 0;
  private readonly pageRecovery = new SeatLayerPickerPageRecovery();
  private pageLostError: SeatLayerError | undefined;
  private bootEvent: string | undefined;
  private bootHoldId: string | undefined;
  private reloadHold: SeatLayerPickerReloadHold | undefined;
  private resuming: SeatLayerPickerResume | undefined;
  private readonly reloadListeners = new Set<() => void>();
  private availabilityRefreshFlight: Promise<SeatLayerPickerLifecycleResult | undefined> | undefined;
  private readonly chartLoads = new SeatLayerPickerChartLoadSubscriptions(
    () => this.mapController.isReady &&
      this.mapController.supportsPickerCapability('chart-load-trace-v1') &&
      this.mapController.supportsPickerEvent('telemetry.chartLoad'),
  );
  private readonly seatRetapListeners = new Set<SeatLayerPickerSeatRetapListener>();
  private readonly booked = new SeatLayerPickerBookedDetector();
  private readonly bookedListeners = new Set<SeatLayerPickerBookedListener>();
  private readonly unsubscribeBookedWatch = this.subscribe(
    () => this.booked.observe(this.getSnapshot()),
  );
  private readonly unsubscribeChartLoad = this.mapController.on('unknownEvent', ({ name, payload }) => {
    if (name === 'telemetry.chartLoad') this.chartLoads.accept(payload);
    if (
      name === seatLayerSeatRetapEvent &&
      this.mapController.supportsPickerEvent(seatLayerSeatRetapEvent)
    ) {
      const seat = decodeSeatLayerPickerSeatRetap(payload);
      if (seat) {
        for (const listener of [...this.seatRetapListeners]) {
          try {
            listener(seat);
          } catch {
            // A host listener cannot break the bridge's event pump.
          }
        }
      }
    }
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

  /** Monotonic runtime-remount generation observed by an attached picker scope. */
  getReloadGeneration = (): number => this.reloadGenerationValue;

  /** @internal Subscribes an attached scope to explicit controller retries. */
  subscribeReload = (listener: () => void): (() => void) => {
    this.reloadListeners.add(listener);
    return () => this.reloadListeners.delete(listener);
  };

  /**
   * Recreates the embedded runtime without replacing this controller.
   *
   * Any live runtime gets a best-effort destroy acknowledgement first. The
   * attached scope then retires stale native chrome and remounts the chart;
   * selection and hold recovery remain runtime/server-authoritative.
   */
  retry(): Promise<void> {
    this.pageRecovery.reset();
    this.pageLostError = undefined;
    return this.reload();
  }

  /** @internal The system ended the page. Everything waiting on it is refused. */
  pageLost(): void {
    this.mapController.disconnect(
      SeatLayerError.transport('The system closed the SeatLayer page.'),
      false,
    );
  }

  /** @internal Replaces a lost page, or says so when pages keep being lost. */
  recoverLostPage(now: number = Date.now()): Promise<void> {
    this.pageLostError = this.pageRecovery.lost(now)
      ? undefined
      : SeatLayerError.transport('The system keeps closing the SeatLayer page.');
    return this.reload();
  }

  /** @internal Set while a lost page is not reloaded by itself any more. */
  getPageLostError = (): SeatLayerError | undefined => this.pageLostError;

  /**
   * A replaced page starts without the hold the one before it had, so it is
   * asked for that hold once it is ready. The hold may be gone by then, which
   * is why it is not put in the page's start, where it would fail the page.
   */
  protected override startConfig(
    configuration: SeatLayerConfiguration,
    config: JsonObject | undefined,
  ): JsonObject | undefined {
    this.bootEvent = configuration.event;
    this.forgetResume();
    const { initialHoldId, ...rest } = config ?? {};
    if (this.reloadHold?.event !== configuration.event) {
      this.reloadHold = undefined;
      this.bootHoldId = typeof initialHoldId === 'string' ? initialHoldId : undefined;
      return config;
    }
    return rest;
  }

  protected override onPageStarted(): void {
    const holdId = this.reloadHold?.holdId;
    this.reloadHold = undefined;
    if (holdId !== undefined) this.resumeAfterReload(holdId);
  }

  private resumeAfterReload(holdId: string): void {
    const resume: SeatLayerPickerResume = { holdId };
    this.resuming = resume;
    const attempt = (last: boolean): void => {
      const pending = (): boolean => this.resuming === resume && !this.disposed;
      void this.serial(async () => {
        // A hold the buyer made while this one waited is the buyer's.
        if (!pending() || this.getSnapshot()?.hold.active === true) return false;
        const snapshot = await this.applyMutationResult(
          await this.command('picker.resumeHold', { holdId }),
        );
        return snapshot?.hold.active === true;
      }).then(
        (restored) => { if (pending()) this.endResume(restored); },
        (error: unknown) => {
          // A page that is gone leaves the hold to the page that replaces it.
          if (!pending() || !this.mapController.isReady) return;
          if (last || !seatLayerPickerUnanswered(error)) {
            this.endResume(false);
            return;
          }
          resume.timer = setTimeout(() => {
            resume.timer = undefined;
            if (pending() && this.mapController.isReady) attempt(true);
          }, seatLayerPickerResumeRetryMs);
        },
      );
    };
    attempt(false);
  }

  /** The answer is final: forgets the hold unless the page has it again. */
  private endResume(restored: boolean): void {
    const holdId = this.resuming?.holdId;
    this.forgetResume();
    const handoff = this.booked.pendingHandoff;
    const another = handoff !== undefined && handoff.holdId !== holdId;
    if (!restored && !another) this.booked.released();
  }

  private forgetResume(): void {
    if (this.resuming?.timer !== undefined) clearTimeout(this.resuming.timer);
    this.resuming = undefined;
  }

  private rememberHoldForReload(): void {
    const resumed = this.resuming?.holdId;
    this.forgetResume();
    const snapshot = this.getSnapshot();
    if (this.bootEvent === undefined || (snapshot === undefined && resumed === undefined)) return;
    this.reloadHold = {
      event: this.bootEvent,
      holdId: snapshot?.hold.active === true
        ? this.booked.pendingHandoff?.holdId ?? this.bootHoldId
        : resumed,
    };
  }

  private reload(): Promise<void> {
    return this.serial(async () => {
      this.rememberHoldForReload();
      this.booked.reloaded();
      if (
        this.mapController.isReady &&
        this.mapController.supportsPickerCommand('picker.destroy')
      ) {
        try {
          await this.command('picker.destroy');
        } catch {
          // Recovery still proceeds when the failed runtime is already gone.
        }
      }
      if (this.disposed) throw SeatLayerError.destroyed();
      this.booked.reloaded();
      this.resetForRuntimeReload();
      this.reloadGenerationValue += 1;
      for (const listener of this.reloadListeners) listener();
    });
  }

  override dispose(): void {
    this.forgetResume();
    this.unsubscribeBookedWatch();
    this.bookedListeners.clear();
    this.unsubscribeChartLoad();
    this.chartLoads.dispose();
    this.reloadListeners.clear();
    this.seatRetapListeners.clear();
    super.dispose();
  }

  /* --- Hold ownership (§4.8, §3.13.13) ---------------------------------- */

  protected override onCheckoutHandoff(handoff: SeatLayerPickerCheckoutHandoff): void {
    this.booked.handedOff(handoff);
    // A handoff LANDED, so whatever the runtime refused before it is no longer
    // the state the buyer is in. Continue now replaces the hold with every
    // seat rather than being refused for a selection the old hold did not
    // cover (Flutter 0.9.1), and a notice left standing from that refusal
    // would tell a buyer on their way to pay that their seats are stuck.
    seatLayerPickerHoldOwnershipStore(this).clear();
  }

  /**
   * The handoff this picker made, retained only so a refusal can be answered
   * with "Release and change seats". It is never put on a snapshot and never
   * handed anywhere the host did not already receive it.
   */
  getCheckoutHandoff = (): SeatLayerPickerCheckoutHandoff | undefined =>
    this.booked.pendingHandoff;

  /** The handoff the page said is booked, after `markBooked`. */
  getBookedHandoff = (): SeatLayerPickerCheckoutHandoff | undefined =>
    this.booked.bookedHandoff;

  /** Fires once per sale, with the handoff that became it. */
  subscribeBooked = (listener: SeatLayerPickerBookedListener): (() => void) => {
    this.bookedListeners.add(listener);
    return () => {
      this.bookedListeners.delete(listener);
    };
  };

  get supportsHandoffReject(): boolean {
    return this.available('checkout-handoff-reject-v1', 'picker.rejectHandoff');
  }

  /**
   * Gives the hold back so the seats go on sale again and the buyer picks
   * afresh. Answers false where there is no handoff to give back or the
   * runtime does not offer the reject — a feature not offered, not a failure.
   */
  releaseHandoffAndChangeSeats(): Promise<boolean> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const handoff = this.booked.pendingHandoff;
    if (handoff === undefined || !this.supportsHandoffReject) {
      return Promise.resolve(false);
    }
    return this.rejectHandoff(handoff.holdId).then(() => {
      this.booked.released();
      return true;
    });
  }

  /** Whether the open page takes the app's own prices. */
  get supportsHostPricing(): boolean {
    return this.available(seatLayerHostPricingCapability, seatLayerSetPricingCommand);
  }

  /**
   * Shows these prices on the open map, or the chart's own for `null`. The
   * prices a picker opens with are its `options.pricing`. A page that does not
   * take prices keeps the chart's. Display only: the server prices the hold.
   */
  setPricing(pricing: SeatLayerPickerPricing | null): Promise<void> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    if (pricing !== null && (typeof pricing !== 'object' || Array.isArray(pricing))) {
      return Promise.reject(badPayload('SeatLayer pricing must be an object or null.'));
    }
    if (!this.supportsHostPricing) return Promise.resolve();
    return this.mutation(seatLayerSetPricingCommand, {
      pricing: seatLayerHostPricesPayload(pricing),
    }).then(() => undefined);
  }

  private bookedByPage(handoff: SeatLayerPickerCheckoutHandoff): void {
    if (!this.booked.said(handoff)) return;
    for (const listener of [...this.bookedListeners]) {
      try {
        listener(handoff);
      } catch {
        // A host listener cannot break the call that booked.
      }
    }
  }

  /** Whether the open page can be told that a hold is booked. */
  get supportsMarkBooked(): boolean {
    return this.available(seatLayerMarkBookedCapability, seatLayerMarkBookedCommand);
  }

  /**
   * Settles a hold your server has booked: the map shows the seats booked, the
   * hold clock stops, and the picker never releases that hold.
   *
   * Call it only after your server has booked; called earlier, the seats show
   * as taken until the server's hold runs out. Without `holdId` it means the
   * hold this picker handed to your checkout. A named one must be the hold held
   * now. Answers false, and changes nothing, for another hold, no hold, or a
   * page that cannot be told.
   */
  markBooked(options: { holdId?: string } = {}): Promise<boolean> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const error = validateOptions(options) ??
      (options.holdId === undefined ? undefined : validateNonEmpty('holdId', options.holdId));
    if (error) return Promise.reject(error);
    if (!this.supportsMarkBooked) return Promise.resolve(false);
    return this.serial(async () => {
      const handoff = this.booked.pendingHandoff;
      const result = await this.command(
        seatLayerMarkBookedCommand,
        options.holdId === undefined ? {} : { holdId: options.holdId },
      );
      await this.applyMutationResult(result);
      const booked = ownData(result, 'booked') === true;
      const same = options.holdId === undefined || options.holdId === handoff?.holdId;
      if (booked && handoff !== undefined && same) this.bookedByPage(handoff);
      return booked;
    });
  }

  get supportsAvailabilityRefresh(): boolean {
    return this.available(seatLayerAvailabilityRefreshCapability, 'picker.refreshAvailability');
  }

  get supportsHoldSelection(): boolean {
    return this.available(seatLayerHoldSelectionCapability, 'picker.holdSelection');
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

  /* --- Native-chrome contract, hosted runtime 0.80.3 -------------------- */
  //
  // `setSelectionFocus`, `setBlockedRegions` and `frameSeat` change nothing a
  // snapshot reports, so the contract gives them no capability string and
  // presence in the hello command table is the whole gate. Each answers
  // `undefined` on a runtime that does not list it: a capability the runtime
  // does not advertise is a feature this host does not offer, never a failure.

  get supportsSelectionFocus(): boolean {
    return this.mapController.isReady &&
      this.mapController.supportsPickerCommand(seatLayerSetSelectionFocusCommand);
  }

  get supportsBlockedRegions(): boolean {
    return this.mapController.isReady &&
      this.mapController.supportsPickerCommand(seatLayerSetBlockedRegionsCommand);
  }

  get supportsFrameSeat(): boolean {
    return this.mapController.isReady &&
      this.mapController.supportsPickerCommand(seatLayerFrameSeatCommand);
  }

  /** `accessibility-focus-v1` announces both camera commands. */
  get supportsAccessibilityFocus(): boolean {
    return this.available(
      seatLayerAccessibilityFocusCapability,
      seatLayerFocusAccessibilityFilterCommand,
    );
  }

  get supportsAccessibleSectionTour(): boolean {
    return this.available(
      seatLayerAccessibilityFocusCapability,
      seatLayerFocusNextAccessibleSectionCommand,
    );
  }

  /** A seat the shell's own card is asking about, or `null` when it closes. */
  setSelectionFocus(seatId: string | null): Promise<void> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    if (seatId !== null && !validateNonEmptySeat(seatId)) {
      return Promise.reject(
        badPayload('SeatLayer selection focus needs a seat id or null.'),
      );
    }
    if (!this.supportsSelectionFocus) return Promise.resolve();
    return this.serial(async () => {
      await this.command(seatLayerSetSelectionFocusCommand, { seatId });
    });
  }

  /** Where the shell's chrome lies over the map, in the map's own CSS pixels. */
  setBlockedRegions(
    regions: readonly SeatLayerPickerBlockedRegion[] | null,
  ): Promise<void> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    let payload: JsonValue;
    try {
      payload = blockedRegionPayload(regions);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!this.supportsBlockedRegions) return Promise.resolve();
    return this.serial(async () => {
      await this.command(seatLayerSetBlockedRegionsCommand, payload);
    });
  }

  /**
   * Pans — never zooms — so the seat rests in the band the reported insets
   * leave clear. Answers `dy: 0` for a seat already in place, an unknown seat,
   * insets that leave no band, and a stale gesture count. `dy` is the pan the
   * runtime asked of its map; a map at its edge moves less.
   */
  frameSeat(
    seatId: string,
    options: SeatLayerPickerFrameSeatOptions = {},
  ): Promise<SeatLayerPickerFrameSeatResult | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const error = validateNonEmpty('seatId', seatId) ?? validateOptions(options) ??
      frameSeatError(options);
    if (error) return Promise.reject(error);
    if (!this.supportsFrameSeat) return Promise.resolve(undefined);
    return this.serial(async () => decodeSeatLayerPickerFrameSeatResult(
      await this.command(seatLayerFrameSeatCommand, {
        seatId,
        ...(options.fraction === undefined ? {} : { fraction: options.fraction }),
        ...(options.animate === undefined ? {} : { animate: options.animate }),
        ...(options.gestures === undefined ? {} : { gestures: options.gestures }),
      }),
    ));
  }

  /** Flies to the matches of the filter already on, leaving the filter alone. */
  focusAccessibilityFilter(): Promise<SeatLayerPickerSnapshot | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    return this.supportsAccessibilityFocus
      ? this.mutation(seatLayerFocusAccessibilityFilterCommand)
      : Promise.resolve(undefined);
  }

  /**
   * Steps to the next section holding a free matching space, in chart order,
   * wrapping. `null` — nothing matches — is an answer, not a failure;
   * `undefined` means the runtime does not offer the tour at all.
   */
  focusNextAccessibleSection(
    types?: readonly string[] | null,
  ): Promise<SeatLayerPickerAccessibleSectionStep | null | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const error = types === undefined || types === null || types.length === 0
      ? undefined
      : validateStrings('types', types as string[]);
    if (error) return Promise.reject(error);
    if (!this.supportsAccessibleSectionTour) return Promise.resolve(undefined);
    return this.serial(async () => {
      const raw = await this.command(seatLayerFocusNextAccessibleSectionCommand, {
        types: types === undefined || types === null || types.length === 0
          ? null
          : [...types],
      });
      await this.applyMutationResult(raw as JsonValue);
      return decodeSeatLayerPickerAccessibleSectionStep(
        ownData(raw, 'step'),
      ) ?? null;
    });
  }

  /**
   * A seat already in the selection tapped again. Subscribing never replays an
   * earlier event, and a runtime that does not advertise `seat.retap` simply
   * never calls the listener.
   */
  subscribeSeatRetap(listener: SeatLayerPickerSeatRetapListener): () => void {
    this.seatRetapListeners.add(listener);
    return () => {
      this.seatRetapListeners.delete(listener);
    };
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

function validateNonEmptySeat(seatId: unknown): boolean {
  return typeof seatId === 'string' && seatId.trim().length > 0;
}

/** Mirrors the runtime's own bounds so a bad ask fails here, not on the wire. */
function frameSeatError(
  options: SeatLayerPickerFrameSeatOptions,
): SeatLayerError | undefined {
  const { fraction, animate, gestures } = options;
  if (
    fraction !== undefined &&
    (typeof fraction !== 'number' || !Number.isFinite(fraction) ||
      fraction < 0 || fraction > 1)
  ) {
    return badPayload('SeatLayer frameSeat fraction must be between 0 and 1.');
  }
  if (animate !== undefined && typeof animate !== 'boolean') {
    return badPayload('SeatLayer frameSeat animate must be a boolean.');
  }
  if (
    gestures !== undefined &&
    (!Number.isInteger(gestures) || (gestures as number) < 0)
  ) {
    return badPayload('SeatLayer frameSeat gestures must be a count of 0 or more.');
  }
  return undefined;
}
