import { BridgeClient, type BridgeSignal, type BridgeTransport } from './bridge/client';
import { decodeEnvelope, type Envelope } from './bridge/envelope';
import {
  decodeProtocolRange,
  nativeProtocolRange,
  negotiateProtocol,
} from './bridge/protocol';
import {
  decodeBestAvailable,
  decodeBundleInfo,
  decodeFloor,
  decodeGAArea,
  decodeHold,
  decodeReadyInfo,
  decodeSeatHover,
  decodeSelectedSeat,
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
  type SelectedSeat,
} from './types';

interface Handshake {
  resolve(value: ReadyInfo): void;
  reject(reason: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}

export class SeatLayerController {
  private readonly events = new TypedEmitter<SeatLayerEventMap>();
  private client: BridgeClient | undefined;
  private configuration: SeatLayerConfiguration | undefined;
  private handshake: Handshake | undefined;
  private queuedFrames: Envelope[] = [];
  private disposed = false;

  readyInfo: ReadyInfo | undefined;
  bundleInfo: BundleInfo | undefined;
  protocolRevision: number | undefined;

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
    this.readyInfo = undefined;
    this.bundleInfo = undefined;
    this.protocolRevision = undefined;

    const client = new BridgeClient(
      transport,
      configuration.commandTimeoutMs ?? 15_000,
    );
    client.onSignal((signal) => this.handleSignal(signal));
    this.client = client;

    const promise = new Promise<ReadyInfo>((resolve, reject) => {
      const timeoutMs = configuration.handshakeTimeoutMs ?? 30_000;
      const timer = setTimeout(() => {
        this.finishHandshake(
          SeatLayerError.timeout('handshake', timeoutMs),
        );
      }, timeoutMs);
      this.handshake = { resolve, reject, timer, settled: false };
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
    const info = decodeBundleInfo(payload);
    this.bundleInfo = info;
    try {
      negotiateProtocol(info.protocol);
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
    const config = compactObject({
      event: configuration.event,
      apiBase: configuration.apiBase,
      publicKey: configuration.publicKey,
      maxSelection: configuration.maxSelection,
      locale: configuration.locale,
      messages: configuration.messages,
      currency: configuration.currency,
      colorblindSafe: configuration.colorblindSafe,
    });
    const host: JsonObject = {
      platform: 'react-native',
      sdk: seatLayerSdkVersion,
      ...(configuration.hostInfo ?? {}),
    };
    this.client?.sendInit({
      protocol: {
        min: nativeProtocolRange.min,
        max: nativeProtocolRange.max,
      },
      host,
      chrome: { seatTooltip: configuration.showsWebSeatTooltip ?? false },
      config,
    });
  }

  private handleEvent(name: string, payload: JsonValue | undefined): void {
    const object = asObject(payload);
    switch (name) {
      case 'sys.ready': {
        const ready = decodeReadyInfo(payload);
        this.finishHandshake(ready);
        return;
      }
      case 'sys.incompatible': {
        const web =
          decodeProtocolRange(object?.web) ?? nativeProtocolRange;
        const message =
          asString(object?.message) ??
          `No shared SeatLayer protocol revision (web ${web.min}..${web.max}).`;
        this.finishHandshake(SeatLayerError.incompatible(message));
        return;
      }
      case 'sys.error':
        this.finishHandshake(SeatLayerError.bridge(payload));
        return;
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
