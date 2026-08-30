import { BridgeClient, type BridgeSignal, type BridgeTransport } from './bridge/client';
import { decodeEnvelope, type Envelope } from './bridge/envelope';
import {
  chartBridgeProfile,
  pickerBridgeProfile,
  type BridgeProfile,
  type PickerBridgeProfileOptions,
} from './bridge/profile';
import {
  decodeProtocolRange,
  negotiateProtocol,
} from './bridge/protocol';
import {
  decodeBestAvailable,
  decodeBuyerAccessExpired,
  decodeBuyerAccessUnavailable,
  decodeBundleInfo,
  decodeFloor,
  decodeGAArea,
  decodeHold,
  decodeReadyInfo,
  decodeSeatHover,
  decodeSelectedObjectsUnavailable,
  decodeSelectedSeat,
  decodeSelectionValidity,
} from './decode';
import { TypedEmitter } from './emitter';
import { SeatLayerError } from './errors';
import {
  asArray,
  asBoolean,
  asObject,
  asString,
  compactObject,
  type JsonObject,
  type JsonValue,
} from './json';
import {
  seatLayerSdkVersion,
  type BestAvailableResult,
  type BundleInfo,
  type FloorInfo,
  type GAArea,
  type HoldResult,
  type ReadyInfo,
  type SeatLayerConfiguration,
  type SeatLayerEventMap,
  type SeatLayerViewMode,
  type SelectedSeat,
  type SelectionValidity,
} from './types';
import { decodeSeatLayerPickerSnapshot } from './picker/decode';
import type { SeatLayerPickerReadyInfo } from './picker/models';

interface Handshake {
  resolve(value: ReadyInfo): void;
  reject(reason: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
  startedAt: number;
  helloAt?: number;
}

function defaultHandshakeClock(): number {
  try {
    const value = globalThis.performance?.now?.();
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function elapsedMilliseconds(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

export class SeatLayerController {
  private readonly events = new TypedEmitter<SeatLayerEventMap>();
  private client: BridgeClient | undefined;
  private configuration: SeatLayerConfiguration | undefined;
  private profile: BridgeProfile = chartBridgeProfile;
  private handshake: Handshake | undefined;
  private queuedFrames: Envelope[] = [];
  private disposed = false;

  constructor(private readonly handshakeClock: () => number = defaultHandshakeClock) {}

  readyInfo: ReadyInfo | undefined;
  bundleInfo: BundleInfo | undefined;
  protocolRevision: number | undefined;
  bundleCommands: readonly string[] = [];
  bundleCapabilities: readonly string[] = [];
  bundleEvents: readonly string[] = [];

  get isReady(): boolean {
    return this.readyInfo !== undefined;
  }

  on<K extends keyof SeatLayerEventMap>(
    name: K,
    listener: (value: SeatLayerEventMap[K]) => void,
  ): () => void {
    return this.events.on(name, listener);
  }

  beginHandshake(
    transport: BridgeTransport,
    configuration: SeatLayerConfiguration,
  ): Promise<ReadyInfo> {
    return this.beginHandshakeWithProfile(transport, configuration, chartBridgeProfile);
  }

  /** Starts the protocol-2 native-chrome picker without changing raw chart behaviour. */
  beginPickerHandshake(
    transport: BridgeTransport,
    configuration: SeatLayerConfiguration,
    options: PickerBridgeProfileOptions = {},
  ): Promise<SeatLayerPickerReadyInfo> {
    let profile: BridgeProfile;
    try {
      profile = pickerBridgeProfile(options);
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
    return this.beginHandshakeWithProfile(
      transport,
      configuration,
      profile,
    ) as Promise<SeatLayerPickerReadyInfo>;
  }

  private beginHandshakeWithProfile(
    transport: BridgeTransport,
    configuration: SeatLayerConfiguration,
    profile: BridgeProfile,
  ): Promise<ReadyInfo> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    if (!configuration.event.trim()) {
      return Promise.reject(
        new SeatLayerError('bad_payload', 'SeatLayer configuration.event is required.'),
      );
    }

    this.disconnect(
      SeatLayerError.transport('The SeatLayer view was reloaded.'),
      false,
    );
    this.configuration = configuration;
    this.profile = profile;
    this.readyInfo = undefined;
    this.bundleInfo = undefined;
    this.protocolRevision = undefined;
    this.bundleCommands = [];
    this.bundleCapabilities = [];
    this.bundleEvents = [];

    const client = new BridgeClient(
      transport,
      configuration.commandTimeoutMs ?? 15_000,
    );
    client.onSignal((signal) => this.handleSignal(signal));
    this.client = client;

    const promise = new Promise<ReadyInfo>((resolve, reject) => {
      const timeoutMs = configuration.handshakeTimeoutMs ?? 30_000;
      const startedAt = this.handshakeClock();
      const timer = setTimeout(() => {
        this.finishHandshake(
          SeatLayerError.timeout('handshake', timeoutMs),
        );
      }, timeoutMs);
      this.handshake = { resolve, reject, timer, settled: false, startedAt };
    });

    const queued = this.queuedFrames;
    this.queuedFrames = [];
    for (const frame of queued) client.ingest(frame);
    return promise;
  }

  ingestRaw(input: unknown): void {
    const envelope = decodeEnvelope(input);
    if (!envelope) return;
    if (!this.client) {
      this.queuedFrames.push(envelope);
      if (this.queuedFrames.length > 20) this.queuedFrames.shift();
      return;
    }
    this.client.ingest(envelope);
  }

  failWithTransport(detail: string, cause?: unknown): void {
    this.finishHandshake(SeatLayerError.transport(detail, cause));
  }

  disconnect(
    error: SeatLayerError = SeatLayerError.transport('SeatLayer view detached.'),
    emit = true,
  ): void {
    this.client?.close(error);
    this.client = undefined;
    const handshake = this.handshake;
    if (handshake && !handshake.settled) {
      handshake.settled = true;
      clearTimeout(handshake.timer);
      handshake.reject(error);
      if (emit) this.events.emit('error', error);
    }
    this.handshake = undefined;
    this.readyInfo = undefined;
  }

  async hold(options: { ttlMs?: number } = {}): Promise<HoldResult | undefined> {
    const result = await this.run('hold', compactObject({ ttlMs: options.ttlMs }));
    return decodeHold(asObject(result)?.hold);
  }

  async resumeHold(holdId: string): Promise<HoldResult | undefined> {
    const result = await this.run('resumeHold', { holdId });
    return decodeHold(asObject(result)?.hold);
  }

  async extendHold(options: { ttlMs?: number } = {}): Promise<HoldResult | undefined> {
    const result = await this.run(
      'extendHold',
      compactObject({ ttlMs: options.ttlMs }),
    );
    return decodeHold(asObject(result)?.hold);
  }

  async release(): Promise<void> {
    await this.run('release');
  }

  async releaseLabels(labels: string[]): Promise<boolean> {
    const result = await this.run('releaseLabels', { labels });
    return asBoolean(asObject(result)?.released) ?? false;
  }

  async bestAvailable(
    quantity: number,
    options: { categoryKey?: string } = {},
  ): Promise<BestAvailableResult | undefined> {
    const result = await this.run(
      'bestAvailable',
      compactObject({ qty: quantity, categoryKey: options.categoryKey }),
    );
    return decodeBestAvailable(asObject(result)?.hold);
  }

  async holdGA(
    areaId: string,
    quantity: number,
    options: { tierId?: string | null; ttlMs?: number } = {},
  ): Promise<HoldResult | undefined> {
    const payload: JsonObject = { areaId, qty: quantity };
    if ('tierId' in options) payload.tierId = options.tierId ?? null;
    if (options.ttlMs !== undefined) payload.ttlMs = options.ttlMs;
    const result = await this.run('holdGA', payload);
    return decodeHold(asObject(result)?.hold);
  }

  async setSeatTier(seatId: string, tierId: string | null): Promise<void> {
    await this.run('setSeatTier', { seatId, tierId });
  }

  async selectObjects(objects: string[]): Promise<SelectedSeat[]> {
    const result = await this.run('selectObjects', { objects });
    return asArray(asObject(result)?.seats).map(decodeSelectedSeat).filter((seat): seat is SelectedSeat => seat !== undefined);
  }

  async deselectObjects(objects: string[]): Promise<void> { await this.run('deselectObjects', { objects }); }
  async clearSelection(): Promise<void> { await this.run('clearSelection'); }
  async selectCategories(categoryKeys: string[]): Promise<SelectedSeat[]> {
    const result = await this.run('selectCategories', { categoryKeys });
    return asArray(asObject(result)?.seats).map(decodeSelectedSeat).filter((seat): seat is SelectedSeat => seat !== undefined);
  }
  async deselectCategories(categoryKeys: string[]): Promise<void> { await this.run('deselectCategories', { categoryKeys }); }
  async setSelectableObjects(objects: string[] | null): Promise<void> { await this.run('setSelectableObjects', { objects }); }
  async setMaxSelection(maxSelection: number): Promise<void> { await this.run('setMaxSelection', { maxSelection }); }
  async getSelectionValidity(): Promise<SelectionValidity | undefined> {
    const result = await this.run('getSelectionValidity');
    return decodeSelectionValidity(asObject(result)?.validity);
  }
  async refreshAccess(): Promise<boolean> {
    const result = await this.run('refreshAccess');
    return asBoolean(asObject(result)?.refreshed) ?? false;
  }

  async getSelection(): Promise<SelectedSeat[]> {
    const result = await this.run('getSelection');
    return asArray(asObject(result)?.seats)
      .map(decodeSelectedSeat)
      .filter((item): item is SelectedSeat => item !== undefined);
  }

  async getCurrentHold(): Promise<HoldResult | undefined> {
    const result = await this.run('getCurrentHold');
    return decodeHold(asObject(result)?.hold);
  }

  async getGAAreas(): Promise<GAArea[]> {
    const result = await this.run('getGAAreas');
    return asArray(asObject(result)?.areas)
      .map(decodeGAArea)
      .filter((item): item is GAArea => item !== undefined);
  }

  async getFloors(): Promise<FloorInfo[]> {
    const result = await this.run('getFloors');
    return asArray(asObject(result)?.floors)
      .map(decodeFloor)
      .filter((item): item is FloorInfo => item !== undefined);
  }

  async setFloor(floorId: string): Promise<void> {
    await this.run('setFloor', { floorId });
  }

  async setColorblindSafe(on: boolean): Promise<void> {
    await this.run('setColorblindSafe', { on });
  }

  async setViewMode(mode: SeatLayerViewMode): Promise<void> {
    await this.run('setViewMode', { mode });
  }

  async getViewMode(): Promise<SeatLayerViewMode> {
    const result = await this.run('getViewMode');
    return asString(asObject(result)?.mode) ?? 'flat';
  }

  async zoomIn(): Promise<void> {
    await this.run('zoomIn');
  }

  async zoomOut(): Promise<void> {
    await this.run('zoomOut');
  }

  async zoomToFit(): Promise<void> {
    await this.run('zoomToFit');
  }

  async destroy(): Promise<void> {
    try {
      await this.run('destroy');
    } finally {
      this.disconnect(SeatLayerError.destroyed(), false);
    }
  }

  /** Runs one advertised picker command after the protocol-2 profile is ready. */
  runPickerCommand(command: string, payload?: JsonValue): Promise<JsonValue | undefined> {
    if (this.profile.surface !== 'picker') {
      return Promise.reject(
        SeatLayerError.incompatible('The attached SeatLayer surface is not a picker.'),
      );
    }
    if (!this.readyInfo || this.protocolRevision !== 2) {
      return Promise.reject(
        SeatLayerError.incompatible('The protocol-2 picker handshake has not completed.'),
      );
    }
    if (!this.supportsPickerCommand(command)) {
      return Promise.reject(
        SeatLayerError.incompatible(
          `The loaded picker does not advertise '${command}'.`,
        ),
      );
    }
    return this.run(command, payload);
  }

  supportsPickerCommand(command: string): boolean {
    return this.profile.surface === 'picker'
      && this.readyInfo !== undefined
      && this.protocolRevision === 2
      && this.bundleCommands.includes(command);
  }

  supportsPickerCapability(capability: string): boolean {
    return this.profile.surface === 'picker'
      && this.readyInfo !== undefined
      && this.protocolRevision === 2
      && this.bundleCapabilities.includes(capability);
  }

  supportsPickerEvent(event: string): boolean {
    return this.profile.surface === 'picker'
      && this.readyInfo !== undefined
      && this.protocolRevision === 2
      && this.bundleEvents.includes(event);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disconnect(SeatLayerError.destroyed(), false);
    this.queuedFrames = [];
    this.events.clear();
  }

  private run(command: string, payload?: JsonValue): Promise<JsonValue | undefined> {
    const client = this.client;
    return client
      ? client.command(command, payload)
      : Promise.reject(SeatLayerError.transport('No SeatLayer view is attached.'));
  }

  private handleSignal(signal: BridgeSignal): void {
    if (signal.kind === 'hello') {
      this.handleHello(signal.payload);
    } else if (signal.kind === 'event') {
      this.handleEvent(signal.name, signal.payload);
    } else {
      this.events.emit('unknownEvent', {
        name: signal.envelope.type,
        payload: signal.envelope.payload,
      });
    }
  }

  private handleHello(payload: JsonValue | undefined): void {
    const handshake = this.handshake;
    if (handshake && !handshake.settled && handshake.helloAt === undefined) {
      handshake.helloAt = this.handshakeClock();
    }
    const info = decodeBundleInfo(payload);
    this.bundleInfo = info;
    this.bundleCommands = Object.freeze([...info.commands]);
    this.bundleCapabilities = Object.freeze([...info.capabilities]);
    this.bundleEvents = Object.freeze([...info.events]);
    try {
      negotiateProtocol(info.protocol, this.profile.protocolRange);
    } catch (error) {
      this.finishHandshake(
        SeatLayerError.incompatible(
          error instanceof Error ? error.message : String(error),
        ),
      );
      return;
    }

    const configuration = this.configuration;
    if (!configuration) return;
    const missingCapabilities = this.profile.requiredCapabilities.filter(
      (capability) => !info.capabilities.includes(capability),
    );
    const missingCommands = this.profile.requiredCommands.filter(
      (command) => !info.commands.includes(command),
    );
    const missingEvents = this.profile.requiredEvents.filter(
      (event) => !info.events.includes(event),
    );
    if (missingCapabilities.length || missingCommands.length || missingEvents.length) {
      const missing = [
        ...missingCapabilities.map((capability) => `capability ${capability}`),
        ...missingCommands.map((command) => `command ${command}`),
        ...missingEvents.map((event) => `event ${event}`),
      ].join(', ');
      this.finishHandshake(SeatLayerError.incompatible(
        `The loaded picker does not satisfy the required protocol-2 contract: ${missing}.`,
      ));
      return;
    }
    const privateAccess = configuration.buyerAccessToken !== undefined || configuration.buyerAccessTokenProvider !== undefined;
    if (privateAccess && !info.capabilities.includes('native-access-provider')) {
      this.finishHandshake(SeatLayerError.incompatible('The loaded web bundle cannot securely handle buyer access. Refusing to initialize private inventory.'));
      return;
    }
    const selectionPolicy = configuration.selectedObjects !== undefined ||
      configuration.selectableObjects !== undefined ||
      configuration.numberOfPlacesToSelect !== undefined ||
      configuration.selectionValidators !== undefined;
    if (selectionPolicy &&
      (!info.capabilities.includes('selection-controls') ||
        !info.capabilities.includes('selection-validity'))) {
      this.finishHandshake(SeatLayerError.incompatible(
        'The loaded web bundle cannot enforce the configured selection policy.',
      ));
      return;
    }
    const config = compactObject({
      event: configuration.event,
      apiBase: configuration.apiBase,
      publicKey: configuration.publicKey,
      buyerAccessToken: configuration.buyerAccessToken === undefined
        ? undefined
        : compactObject({
            token: configuration.buyerAccessToken.token,
            expiresAt: configuration.buyerAccessToken.expiresAt,
          }),
      nativeAccessProvider: configuration.buyerAccessTokenProvider === undefined ? undefined : true,
      maxSelection: configuration.maxSelection,
      selectedObjects: configuration.selectedObjects,
      selectableObjects: configuration.selectableObjects,
      numberOfPlacesToSelect: configuration.numberOfPlacesToSelect,
      selectionValidators: configuration.selectionValidators,
      locale: configuration.locale,
      messages: configuration.messages,
      currency: configuration.currency,
      colorblindSafe: configuration.colorblindSafe,
      initialView: configuration.initialView,
    });
    const host: JsonObject = {
      platform: 'react-native',
      sdk: seatLayerSdkVersion,
      ...(configuration.hostInfo ?? {}),
    };
    this.client?.sendInit({
      protocol: {
        min: this.profile.protocolRange.min,
        max: this.profile.protocolRange.max,
      },
      host,
      chrome: this.profile.surface === 'picker'
        ? {
            owner: 'native', seatTooltip: false, testModeIndicator: false, attribution: false,
            ...(info.capabilities.includes('native-seat-view-chrome-v1')
              && info.events.includes('seatView.changed')
              ? { seatViewTitle: false, seatViewCaption: false, seatViewBadge: false }
              : {}),
          }
        : { seatTooltip: configuration.showsWebSeatTooltip ?? false },
      config: this.profile.surface === 'picker'
        ? { ...config, ...(this.profile.config ?? {}) }
        : config,
      ...(this.profile.surface === 'picker' ? {
        surface: { kind: 'picker', stateContract: 1, chromeOwner: 'native' },
        requirements: { capabilities: [...this.profile.requiredCapabilities] },
      } : {}),
    });
  }

  private handleEvent(name: string, payload: JsonValue | undefined): void {
    const object = asObject(payload);
    switch (name) {
      case 'sys.ready': {
        const decodedReady = decodeReadyInfo(payload);
        const handshake = this.handshake;
        const readyAt = this.handshakeClock();
        const timings = handshake === undefined
          ? {}
          : {
              ...(handshake.helloAt === undefined
                ? {}
                : {
                    timeToHelloMs: elapsedMilliseconds(
                      handshake.startedAt,
                      handshake.helloAt,
                    ),
                  }),
              timeToReadyMs: elapsedMilliseconds(handshake.startedAt, readyAt),
            };
        const snapshot = this.profile.surface === 'picker'
          ? decodeSeatLayerPickerSnapshot(object?.snapshot)
          : undefined;
        const ready: SeatLayerPickerReadyInfo = {
          ...decodedReady,
          ...timings,
          ...(snapshot === undefined ? {} : { snapshot }),
        };
        if (this.profile.surface === 'picker' && ready.protocolRevision !== 2) {
          this.finishHandshake(
            SeatLayerError.incompatible(
              'The picker runtime did not confirm protocol revision 2.',
            ),
          );
          return;
        }
        this.finishHandshake(ready);
        return;
      }
      case 'sys.incompatible': {
        const web =
          decodeProtocolRange(object?.web) ?? this.profile.protocolRange;
        const message =
          asString(object?.message) ??
          `No shared SeatLayer protocol revision (web ${web.min}..${web.max}).`;
        this.finishHandshake(SeatLayerError.incompatible(message));
        return;
      }
      case 'sys.error':
        this.finishHandshake(SeatLayerError.bridge(payload));
        return;
      case 'access.token.request': {
        const requestId = asString(object?.requestId);
        const reason = asString(object?.reason) ?? 'refresh';
        const provider = this.configuration?.buyerAccessTokenProvider;
        const client = this.client;
        if (!requestId) return;
        const answerUnavailable = () => {
          void client?.command('access.token.unavailable', { requestId }).catch(() => {});
        };
        if (!provider) { answerUnavailable(); return; }
        Promise.resolve().then(() => provider({ reason })).then((token) => {
          if (!token || typeof token.token !== 'string' || !token.token ||
            (token.expiresAt !== undefined && (!Number.isFinite(token.expiresAt)))) {
            answerUnavailable();
            return;
          }
          void client?.command('access.token.provide', {
            requestId, token: token.token,
            ...(token.expiresAt === undefined ? {} : { expiresAt: token.expiresAt }),
          }).catch(() => {});
        }, answerUnavailable);
        return;
      }
      case 'selection.validity.changed': {
        const validity = decodeSelectionValidity(object?.validity);
        if (validity) this.events.emit('selectionValidityChanged', validity);
        return;
      }
      case 'selection.valid':
        this.events.emit(
          'selectionValid',
          asArray(object?.seats)
            .map(decodeSelectedSeat)
            .filter((item): item is SelectedSeat => item !== undefined),
        );
        return;
      case 'selection.invalid': {
        const validity = decodeSelectionValidity(object?.validity);
        if (validity) this.events.emit('selectionInvalid', validity);
        return;
      }
      case 'selection.limit': {
        const maximum = typeof object?.maxSelection === 'number' &&
          Number.isInteger(object.maxSelection)
          ? object.maxSelection
          : undefined;
        if (maximum !== undefined) this.events.emit('selectionLimit', maximum);
        return;
      }
      case 'access.expired': {
        const event = decodeBuyerAccessExpired(payload);
        if (event) this.events.emit('accessExpired', event);
        return;
      }
      case 'access.unavailable': {
        const event = decodeBuyerAccessUnavailable(payload);
        if (event) this.events.emit('accessUnavailable', event);
        return;
      }
      case 'selection.unavailable': {
        const event = decodeSelectedObjectsUnavailable(payload);
        if (event) this.events.emit('selectedObjectsUnavailable', event);
        return;
      }
      case 'selection.changed':
        this.events.emit(
          'selectionChanged',
          asArray(object?.seats)
            .map(decodeSelectedSeat)
            .filter((item): item is SelectedSeat => item !== undefined),
        );
        return;
      case 'hold.changed': {
        const hold = decodeHold(object?.hold);
        if (hold) this.events.emit('holdChanged', hold);
        return;
      }
      case 'hold.restored': {
        const hold = decodeHold(object?.hold);
        if (hold) this.events.emit('holdRestored', hold);
        return;
      }
      case 'hold.expired':
        this.events.emit('holdExpired', undefined);
        return;
      case 'ga.click': {
        const area = decodeGAArea(object?.area);
        if (area) this.events.emit('gaClick', area);
        return;
      }
      case 'hint':
        this.events.emit('hint', asString(object?.message));
        return;
      case 'error':
        this.events.emit('error', SeatLayerError.bridge(payload));
        return;
      case 'seat.hover':
        this.events.emit('seatHover', decodeSeatHover(object?.details));
        return;
      case 'deck.tap': {
        const floorId = asString(object?.floorId);
        if (floorId) this.events.emit('deckTap', floorId);
        return;
      }
      case 'checkout':
        this.events.emit('checkout', payload);
        return;
      default:
        this.events.emit('unknownEvent', { name, payload });
    }
  }

  private finishHandshake(outcome: ReadyInfo | SeatLayerError): void {
    const handshake = this.handshake;
    if (!handshake || handshake.settled) {
      if (outcome instanceof SeatLayerError) this.events.emit('error', outcome);
      return;
    }
    handshake.settled = true;
    clearTimeout(handshake.timer);
    this.handshake = undefined;

    if (outcome instanceof SeatLayerError) {
      handshake.reject(outcome);
      this.events.emit('error', outcome);
      return;
    }
    this.readyInfo = outcome;
    this.protocolRevision = outcome.protocolRevision;
    handshake.resolve(outcome);
    this.events.emit('ready', outcome);
  }
}
