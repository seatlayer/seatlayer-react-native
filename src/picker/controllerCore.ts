import type { BridgeTransport } from '../bridge/client';
import { pickerBridgeProfile } from '../bridge/profile';
import { SeatLayerController } from '../controller';
import { SeatLayerError } from '../errors';
import { asInteger, asObject, type JsonObject, type JsonValue } from '../json';
import type { SeatLayerConfiguration } from '../types';
import type { SeatLayerPickerMapTheme, SeatLayerThemeMode } from './theme';
import { decodeSeatLayerPickerCheckoutHandoff, decodeSeatLayerPickerSnapshot, decodeSeatLayerSeatView } from './decode';
import { seatLayerAllFloors } from './models';
import { sameSeatView } from './seat-view';
import type {
  SeatLayerPickerBridgeOptions,
  SeatLayerPickerCheckoutHandoff,
  SeatLayerPickerReadyInfo,
  SeatLayerPickerSnapshot,
  SeatLayerPickerViewportInsets,
  SeatLayerSeatView,
} from './models';
import { SeatLayerPickerGACandidateStore, type SeatLayerPickerGACandidate } from './ga-candidate-store';
import { SeatLayerPickerSnapshotStore } from './snapshot-store';
import {
  validateBoolean,
  validateMapTheme,
  validateNonEmpty,
  validateOptions,
  validatePositiveInteger,
  validateStrings,
  validateViewportInsets,
} from './validation';

const nativeChromeCapability = 'native-chrome-contract-v1';
const viewportInsetsCapability = 'viewport-insets-v1';

export interface SeatLayerPickerControllerOptions {
  readonly revisionWaitMs?: number;
}

/** Structural GA click state; resolve its display data from the current snapshot. */
export type { SeatLayerPickerGACandidate } from './ga-candidate-store';

/** Headless protocol-2 controller. Apps own all chrome and render the snapshot. */
export class SeatLayerPickerControllerCore {
  private readonly snapshots = new SeatLayerPickerSnapshotStore();
  private readonly ownsMapController: boolean;
  private readonly revisionWaitMs: number;
  protected disposed = false;
  private unsubscribe: (() => void) | undefined;
  private gaClickUnsubscribe: (() => void) | undefined;
  private readonly gaCandidates = new SeatLayerPickerGACandidateStore(
    () =>
      !this.disposed &&
      this.mapController.isReady &&
      this.mapController.supportsPickerCapability('ga') &&
      this.mapController.supportsPickerEvent('ga.click') &&
      this.mapController.supportsPickerCommand('picker.holdGA'),
    () => this.snapshots.getSnapshot(),
  );
  private readonly seatViewListeners = new Set<() => void>();
  private currentSeatView: SeatLayerSeatView | undefined;
  private actionTail: Promise<void> = Promise.resolve();
  private checkoutInFlight: Promise<SeatLayerPickerCheckoutHandoff> | undefined;
  private readonly revisionCancels = new Set<() => void>();
  private readonly commandCancels = new Set<() => void>();
  readonly mapController: SeatLayerController;

  constructor(
    mapController: SeatLayerController | undefined = undefined,
    options: SeatLayerPickerControllerOptions = {},
  ) {
    this.ownsMapController = mapController === undefined;
    this.mapController = mapController ?? new SeatLayerController();
    this.revisionWaitMs = options.revisionWaitMs ?? 2_000;
    this.unsubscribe = this.mapController.on(
      'unknownEvent',
      ({ name, payload }) => {
        if (
          name === 'picker.snapshot' &&
          this.mapController.isReady &&
          this.mapController.supportsPickerEvent('picker.snapshot')
        ) {
          const decoded = decodeSeatLayerPickerSnapshot(
            asObject(payload)?.snapshot ?? payload,
          );
          const readySnapshot = (
            this.mapController.readyInfo as SeatLayerPickerReadyInfo | undefined
          )?.snapshot;
          if (
            decoded &&
            (readySnapshot === undefined ||
              readySnapshot.sessionId === decoded.sessionId)
          ) {
            this.applyPickerSnapshot(decoded);
          }
        }
        if (
          name === 'seatView.changed' &&
          this.mapController.supportsPickerCapability(
            'native-seat-view-chrome-v1',
          ) &&
          this.mapController.supportsPickerEvent('seatView.changed')
        ) {
          const next = decodeSeatLayerSeatView(asObject(payload)?.seatView);
          if (!sameSeatView(next, this.currentSeatView)) {
            this.currentSeatView = next;
            this.notifySeatViewListeners();
          }
        }
      },
    );
    this.gaClickUnsubscribe = this.mapController.on('gaClick', (area) => this.gaCandidates.accept(area.id));
  }

  getSnapshot = (): SeatLayerPickerSnapshot | undefined =>
    this.snapshots.getSnapshot();

  subscribe = (listener: () => void): () => void =>
    this.snapshots.subscribe(listener);

  getGACandidate = (): SeatLayerPickerGACandidate | undefined => this.gaCandidates.getSnapshot();

  subscribeGACandidate = (listener: () => void): (() => void) => this.gaCandidates.subscribe(listener);

  /** Clears one exact click so an earlier prompt cannot dismiss a newer click. */
  clearGACandidate = (clickEpoch: number): boolean => {
    return this.gaCandidates.clearExact(clickEpoch);
  };

  getSeatView = (): SeatLayerSeatView | undefined => {
    return this.supportsNativeSeatViewChrome ? this.currentSeatView : undefined;
  };

  subscribeSeatView = (listener: () => void): () => void => {
    this.seatViewListeners.add(listener);
    return () => this.seatViewListeners.delete(listener);
  };

  get supportsFloorStack(): boolean {
    return this.available('floor-stack-v1', 'picker.setFloor');
  }

  get supportsViewportInsets(): boolean {
    return this.available(viewportInsetsCapability, 'picker.setViewportInsets');
  }

  get supportsVenue3D(): boolean {
    return this.available('venue-3d-v1', 'picker.setBuyerView');
  }

  get supportsSeatView(): boolean {
    return this.available('seat-view-v1', 'picker.openSeatView');
  }

  get supportsNativeSeatViewChrome(): boolean {
    return this.mapController.isReady &&
      this.mapController.supportsPickerCapability(
        'native-seat-view-chrome-v1',
      ) &&
      this.mapController.supportsPickerEvent('seatView.changed');
  }

  showAllFloors(): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.available('floor-stack-v1', 'picker.setFloor')
      ? this.setFloor(seatLayerAllFloors)
      : Promise.resolve(undefined);
  }
  beginHandshake(
    transport: BridgeTransport,
    configuration: SeatLayerConfiguration,
    options: SeatLayerPickerBridgeOptions = {},
  ): Promise<SeatLayerPickerReadyInfo> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    if (
      typeof configuration.event !== 'string' ||
      !configuration.event.trim()
    ) {
      return Promise.reject(
        new SeatLayerError(
          'bad_payload',
          'SeatLayer configuration.event is required.',
        ),
      );
    }
    let safeConfig: SeatLayerPickerBridgeOptions['config'];
    try {
      safeConfig = pickerBridgeProfile(options).config;
    } catch (error) {
      return Promise.reject(
        error instanceof SeatLayerError
          ? error
          : new SeatLayerError(
            'bad_payload',
            'SeatLayer picker bridge config is invalid.',
          ),
      );
    }
    this.snapshots.clear();
    this.gaCandidates.reset();
    if (this.currentSeatView !== undefined) {
      this.currentSeatView = undefined;
      this.notifySeatViewListeners();
    }
    return this.mapController
      .beginPickerHandshake(transport, configuration, {
        config: safeConfig,
      })
      .then((ready) => {
        if (ready.snapshot) this.applyPickerSnapshot(ready.snapshot);
        return ready;
      });
  }
  synchronize(): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.mutation('picker.getSnapshot');
  }
  clearSelection(): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.mutation('picker.clearSelection');
  }
  removeCartLine(label: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('label', label),
      () => this.mutation('picker.removeCartLine', { label }),
    );
  }
  setSeatTier(
    seatId: string,
    tierId: string | null,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('seatId', seatId) ??
        (tierId === null ? undefined : validateNonEmpty('tierId', tierId)),
      () => this.mutation('picker.setSeatTier', { seatId, tierId }),
    );
  }
  selectObjects(
    objects: string[],
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateStrings('objects', objects),
      () => this.mutation('picker.selectObjects', { objects }),
    );
  }
  deselectObjects(
    objects: string[],
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateStrings('objects', objects),
      () => this.mutation('picker.deselectObjects', { objects }),
    );
  }
  setMaxSelection(
    maxSelection: number,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validatePositiveInteger('maxSelection', maxSelection),
      () => this.mutation('picker.setMaxSelection', { maxSelection }),
    );
  }
  setFloor(floorId: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('floorId', floorId),
      () => this.mutation('picker.setFloor', { floorId }),
    );
  }
  selectCategories(
    categoryKeys: string[],
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateStrings('categoryKeys', categoryKeys),
      () => this.mutation('picker.selectCategories', { categoryKeys }),
    );
  }
  deselectCategories(
    categoryKeys: string[],
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateStrings('categoryKeys', categoryKeys),
      () => this.mutation('picker.deselectCategories', { categoryKeys }),
    );
  }
  setSelectableObjects(
    objects: string[] | null,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      objects === null ? undefined : validateStrings('objects', objects),
      () => this.mutation('picker.setSelectableObjects', { objects }),
    );
  }
  setCategoryFilter(
    categoryKeys: string[],
    focus = false,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    const error = Array.isArray(categoryKeys) && categoryKeys.length === 0
      ? undefined
      : validateStrings('categoryKeys', categoryKeys);
    const payload = {
      categoryKeys: Array.isArray(categoryKeys) && categoryKeys.length > 0
        ? categoryKeys
        : null,
      ...(focus ? { focus: true } : {}),
    };
    return this.guard(
      error,
      () => this.mutation('picker.setCategoryFilter', payload),
    );
  }
  setLimitedViewFilter(
    on: boolean,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateBoolean('on', on),
      () => this.mutation('picker.setLimitedViewFilter', { on }),
    );
  }
  setAccessibilityFilter(
    types: string[],
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    const error = Array.isArray(types) && types.length === 0
      ? undefined
      : validateStrings('types', types);
    const payload = {
      types: Array.isArray(types) && types.length > 0 ? types : null,
    };
    return this.guard(
      error,
      () => this.mutation('picker.setAccessibilityFilter', payload),
    );
  }
  focusSection(
    sectionId: string,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('sectionId', sectionId),
      () => this.mutation('picker.focusSection', { sectionId }),
    );
  }
  overview(): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.mutation('picker.overview');
  }
  setRung(rung: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('rung', rung),
      () => this.mutation('picker.setRung', { rung }),
    );
  }
  setColorblindSafe(on: boolean): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateBoolean('on', on),
      () => this.mutation('picker.setColorblindSafe', { on }),
    );
  }
  setViewMode(mode: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('mode', mode),
      () => this.mutation('picker.setViewMode', { mode }),
    );
  }
  setBuyerView(
    view: string,
    options: { flyToSeatId?: string; resetView?: boolean } = {},
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    const optionsError = validateOptions(options);
    if (optionsError) return Promise.reject(optionsError);
    const error = validateNonEmpty('view', view) ??
      (options.flyToSeatId === undefined
        ? undefined
        : validateNonEmpty('flyToSeatId', options.flyToSeatId)) ??
      (options.resetView === undefined
        ? undefined
        : validateBoolean('resetView', options.resetView));
    const payload = {
      view,
      ...(options.flyToSeatId === undefined
        ? {}
        : { flyToSeatId: options.flyToSeatId }),
      ...(options.resetView ? { resetView: true } : {}),
    };
    return this.guard(
      error,
      () => this.optionalSurface('venue-3d-v1', 'picker.setBuyerView', payload),
    );
  }
  openSeatView(seatId: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('seatId', seatId),
      () =>
        this.optionalSurface('seat-view-v1', 'picker.openSeatView', { seatId }),
    );
  }
  setVenue3DNavigationMode(
    mode: string,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('mode', mode),
      () =>
        this.optionalSurface(
          'venue-3d-controls-v1',
          'picker.setVenue3DNavigationMode',
          { mode },
        ),
    );
  }
  zoomIn(): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.mutation('picker.zoomIn');
  }
  zoomOut(): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.mutation('picker.zoomOut');
  }
  zoomToFit(): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.mutation('picker.zoomToFit');
  }
  setTableQuantity(
    label: string,
    quantity: number,
    options: { ttlMs?: number } = {},
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    const optionsError = validateOptions(options);
    if (optionsError) return Promise.reject(optionsError);
    const error = validateNonEmpty('label', label) ??
      validatePositiveInteger('quantity', quantity) ??
      (options.ttlMs === undefined
        ? undefined
        : validatePositiveInteger('ttlMs', options.ttlMs));
    const payload = {
      label,
      quantity,
      ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }),
    };
    return this.guard(
      error,
      () => this.mutation('picker.setTableQuantity', payload),
    );
  }
  rejectHandoff(holdId: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('holdId', holdId),
      () => this.mutation('picker.rejectHandoff', { holdId }),
    );
  }
  setLifecycle(state: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('state', state),
      () =>
        this.mutation('picker.lifecycle', {
          state: state === 'resumed' || state === 'foreground'
            ? 'foreground'
            : 'background',
        }),
    );
  }
  destroy(): Promise<void> {
    return this.serial(async () => {
      await this.command('picker.destroy');
      this.mapController.disconnect(SeatLayerError.destroyed(), false);
      this.dispose();
    });
  }
  bestAvailable(
    qty: number,
    options: {
      categoryKey?: string;
      zoneId?: string;
      preferPremium?: boolean;
      ttlMs?: number;
    } = {},
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    const optionsError = validateOptions(options);
    if (optionsError) return Promise.reject(optionsError);
    const error = validatePositiveInteger('qty', qty) ??
      (options.categoryKey === undefined
        ? undefined
        : validateNonEmpty('categoryKey', options.categoryKey)) ??
      (options.zoneId === undefined
        ? undefined
        : validateNonEmpty('zoneId', options.zoneId)) ??
      (options.ttlMs === undefined
        ? undefined
        : validatePositiveInteger('ttlMs', options.ttlMs)) ??
      (options.preferPremium === undefined
        ? undefined
        : validateBoolean('preferPremium', options.preferPremium));
    const payload = {
      qty,
      ...(options.categoryKey === undefined
        ? {}
        : { categoryKey: options.categoryKey }),
      ...(options.zoneId === undefined ? {} : { zoneId: options.zoneId }),
      preferPremium: options.preferPremium ?? false,
      ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }),
    };
    return this.guard(
      error,
      () => this.mutation('picker.bestAvailable', payload),
    );
  }
  holdGA(
    areaId: string,
    qty: number,
    options: { tierId?: string | null; ttlMs?: number } = {},
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    const optionsError = validateOptions(options);
    if (optionsError) return Promise.reject(optionsError);
    const error = validateNonEmpty('areaId', areaId) ??
      validatePositiveInteger('qty', qty) ??
      (options.tierId === undefined || options.tierId === null
        ? undefined
        : validateNonEmpty('tierId', options.tierId)) ??
      (options.ttlMs === undefined
        ? undefined
        : validatePositiveInteger('ttlMs', options.ttlMs));
    const payload = {
      areaId,
      qty,
      ...(Object.prototype.hasOwnProperty.call(options, 'tierId')
        ? { tierId: options.tierId ?? null }
        : {}),
      ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }),
    };
    return this.guard(error, () => this.mutation('picker.holdGA', payload));
  }
  resumeHold(holdId: string): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      validateNonEmpty('holdId', holdId),
      () => this.mutation('picker.resumeHold', { holdId }),
    );
  }
  extendHold(ttlMs?: number): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.guard(
      ttlMs === undefined ? undefined : validatePositiveInteger('ttlMs', ttlMs),
      () =>
        this.mutation(
          'picker.extendHold',
          ttlMs === undefined ? undefined : { ttlMs },
        ),
    );
  }
  abort(): Promise<SeatLayerPickerSnapshot | undefined> {
    return this.mutation('picker.abort');
  }
  setThemeMode(
    mode: SeatLayerThemeMode | null,
    mapTheme?: SeatLayerPickerMapTheme | null,
  ): Promise<void> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    if (
      mode !== null && mode !== 'auto' && mode !== 'light' && mode !== 'dark'
    ) {
      return Promise.reject(
        new SeatLayerError('bad_payload', 'SeatLayer theme mode is invalid.'),
      );
    }
    const mapThemeError = validateMapTheme(mapTheme);
    if (mapThemeError) return Promise.reject(mapThemeError);
    if (!this.mapController.supportsPickerCommand('picker.setThemeMode')) {
      return Promise.resolve();
    }
    const payload: JsonObject = mapTheme === undefined ||
        !this.mapController.supportsPickerCapability(nativeChromeCapability)
      ? { mode }
      : { mode, mapTheme: mapTheme as JsonObject | null };
    return this.presentation('picker.setThemeMode', payload);
  }
  setInteractionEnabled(enabled: boolean): Promise<void> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const error = validateBoolean('enabled', enabled);
    if (error) return Promise.reject(error);
    return this.mapController.supportsPickerCommand(
        'picker.setInteractionEnabled',
      )
      ? this.presentation('picker.setInteractionEnabled', { enabled })
      : Promise.resolve();
  }
  setViewportInsets(
    insets: SeatLayerPickerViewportInsets | null,
  ): Promise<void> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const error = validateViewportInsets(insets);
    if (error) return Promise.reject(error);
    if (
      !this.mapController.supportsPickerCapability(viewportInsetsCapability) ||
      !this.mapController.supportsPickerCommand('picker.setViewportInsets')
    ) {
      return Promise.resolve();
    }
    const clamp = (value: number) =>
      Number.isFinite(value) && value >= 0 ? value : 0;
    const payload: JsonObject = insets === null ? { insets: null } : {
      top: clamp(insets.top),
      right: clamp(insets.right),
      bottom: clamp(insets.bottom),
      left: clamp(insets.left),
    };
    return this.presentation('picker.setViewportInsets', payload);
  }
  checkout(ttlMs?: number): Promise<SeatLayerPickerCheckoutHandoff> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const invalidTtl = ttlMs === undefined
      ? undefined
      : validatePositiveInteger('ttlMs', ttlMs);
    if (invalidTtl) return Promise.reject(invalidTtl);
    if (this.checkoutInFlight) return this.checkoutInFlight;
    const flight = this.serial(async () => {
      const result = await this.command(
        'picker.continue',
        ttlMs === undefined ? undefined : { ttlMs },
      );
      await this.applyMutationResult(result);
      const handoff = decodeSeatLayerPickerCheckoutHandoff(
        asObject(result)?.handoff,
      );
      if (!handoff) {
        throw new SeatLayerError(
          'bad_payload',
          'picker.continue returned no checkout handoff.',
        );
      }
      return handoff;
    });
    this.checkoutInFlight = flight;
    void flight
      .finally(() => {
        if (this.checkoutInFlight === flight) {
          this.checkoutInFlight = undefined;
        }
      })
      .catch(() => {});
    return flight;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.commandCancels) cancel();
    this.commandCancels.clear();
    for (const cancel of this.revisionCancels) cancel();
    this.revisionCancels.clear();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.gaClickUnsubscribe?.();
    this.gaClickUnsubscribe = undefined;
    this.gaCandidates.dispose();
    this.seatViewListeners.clear();
    if (this.ownsMapController) this.mapController.dispose();
  }
  protected mutation(
    command: string,
    payload?: JsonValue,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    return this.serial(async () =>
      this.applyMutationResult(await this.command(command, payload))
    );
  }
  private optionalSurface(
    capability: string,
    command: string,
    payload?: JsonValue,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    return this.available(capability, command)
      ? this.mutation(command, payload)
      : Promise.resolve(undefined);
  }
  private presentation(command: string, payload?: JsonValue): Promise<void> {
    return this.serial(async () => {
      await this.command(command, payload);
    });
  }
  protected command(
    command: string,
    payload?: JsonValue,
  ): Promise<JsonValue | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    if (!this.mapController.supportsPickerCommand(command)) {
      return Promise.reject(
        SeatLayerError.incompatible(
          `The loaded picker does not advertise '${command}'.`,
        ),
      );
    }
    return new Promise<JsonValue | undefined>((resolve, reject) => {
      let settled = false;
      let cancel: () => void;
      const finish = (
        outcome: 'resolve' | 'reject',
        value: JsonValue | undefined | unknown,
      ) => {
        if (settled) return;
        settled = true;
        this.commandCancels.delete(cancel);
        if (outcome === 'resolve') {
          resolve(value as JsonValue | undefined);
        } else {
          reject(value);
        }
      };
      cancel = () => finish('reject', SeatLayerError.destroyed());
      this.commandCancels.add(cancel);
      let raw: Promise<JsonValue | undefined>;
      try {
        raw = this.mapController.runPickerCommand(command, payload);
      } catch (error) {
        finish('reject', error);
        return;
      }
      void raw.then(
        (value) => finish('resolve', value),
        (error: unknown) => finish('reject', error),
      );
    });
  }
  protected async applyMutationResult(
    result: JsonValue | undefined,
  ): Promise<SeatLayerPickerSnapshot | undefined> {
    const snapshot = this.snapshots.ingest(
      asObject(result)?.snapshot ?? result,
    );
    if (snapshot) this.gaCandidates.reconcile();
    const target = asInteger(asObject(result)?.revision);
    if (
      target !== undefined &&
      (this.snapshots.getSnapshot()?.revision ?? -1) < target
    ) {
      await this.awaitRevision(target);
    }
    return snapshot ?? this.snapshots.getSnapshot();
  }
  private async awaitRevision(target: number): Promise<void> {
    if ((this.snapshots.getSnapshot()?.revision ?? -1) >= target) return;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: SeatLayerError) => {
        clearTimeout(timer);
        unsubscribe();
        this.revisionCancels.delete(cancel);
        if (error) reject(error);
        else resolve();
      };
      const unsubscribe = this.subscribe(() => {
        if ((this.snapshots.getSnapshot()?.revision ?? -1) >= target) {
          finish();
        }
      });
      const timer = setTimeout(() => finish(), this.revisionWaitMs);
      const cancel = () => finish(SeatLayerError.destroyed());
      this.revisionCancels.add(cancel);
    });
    if ((this.snapshots.getSnapshot()?.revision ?? -1) < target) {
      const result = await this.command('picker.getSnapshot');
      const snapshot = this.snapshots.ingest(
        asObject(result)?.snapshot ?? result,
      );
      if (snapshot) this.gaCandidates.reconcile();
      if ((this.snapshots.getSnapshot()?.revision ?? -1) < target) {
        throw new SeatLayerError(
          'bad_payload',
          `picker.getSnapshot did not reach revision ${target}.`,
        );
      }
    }
  }
  protected serial<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    const guarded = () =>
      this.disposed ? Promise.reject(SeatLayerError.destroyed()) : operation();
    const next = this.actionTail.then(guarded, guarded);
    this.actionTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  /** Clears runtime-derived state before the same controller starts a new chart. */
  protected resetForRuntimeReload(): void {
    this.snapshots.clear();
    this.gaCandidates.reset();
    if (this.currentSeatView !== undefined) {
      this.currentSeatView = undefined;
      this.notifySeatViewListeners();
    }
  }
  protected available(capability: string, command: string): boolean {
    return this.mapController.isReady &&
      this.mapController.supportsPickerCapability(capability) &&
      this.mapController.supportsPickerCommand(command);
  }
  private applyPickerSnapshot(snapshot: SeatLayerPickerSnapshot): boolean {
    const applied = this.snapshots.apply(snapshot);
    if (applied) this.gaCandidates.reconcile();
    return applied;
  }
  protected guard<T>(
    error: SeatLayerError | undefined,
    next: () => Promise<T>,
  ): Promise<T> {
    return error ? Promise.reject(error) : next();
  }
  private notifySeatViewListeners(): void {
    for (const listener of this.seatViewListeners) {
      listener();
    }
  }
}
