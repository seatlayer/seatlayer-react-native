import type { BridgeTransport } from '../bridge/client';
import type { BridgeProfile, PageBridgeSurface } from '../bridge/profile';
import { SeatLayerController } from '../controller';
import { decodeBuyerAccessExpired, decodeBuyerAccessUnavailable } from '../decode';
import { TypedEmitter } from '../emitter';
import { SeatLayerError } from '../errors';
import { asBoolean, asObject, asString, type JsonObject, type JsonValue } from '../json';
import {
  seatLayerConnectionStateFrom,
  type SeatLayerConnectionState,
} from '../picker/connection';
import type {
  BuyerAccessExpiredEvent,
  BuyerAccessUnavailableEvent,
  ReadyInfo,
  SeatLayerSurfaceConfiguration,
  UnknownEvent,
} from '../types';

/** A hold a page of its own hands the app: one operation, until it ends. */
export interface SeatLayerPageHold {
  readonly operationId: string;
  /** Milliseconds since the Unix epoch. */
  readonly expiresAt: number;
}

/** What every page of its own tells its listeners. */
export interface SeatLayerPageEvents<Hold> {
  ready: ReadyInfo;
  error: SeatLayerError;
  /** The hold changed: made, changed or let go (null). */
  hold: Hold | null;
  /** The hold ran out or the server let it go. */
  holdExpired: undefined;
  /** The buyer pressed Continue: book this hold on your server. Once per hold. */
  continue: Hold;
  /** A hold this page made or restored is booked. Once per hold. */
  booked: Hold;
  /** The page's line to the server. */
  connection: SeatLayerConnectionState;
  accessExpired: BuyerAccessExpiredEvent;
  accessUnavailable: BuyerAccessUnavailableEvent;
  /** An event this SDK does not know yet. */
  unknownEvent: UnknownEvent;
  /** @internal Something the picker draws may have changed. */
  changed: undefined;
}

/** The page's own names for the events every page has. */
export interface SeatLayerPageEventNames {
  readonly continue: string;
  readonly accessExpired: string;
  readonly accessUnavailable: string;
}

/** The room the app's own bars take around the page, in points. */
export interface SeatLayerPageInsets {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

/**
 * Drives one page of its own (the Season page, the run page) over the one
 * SeatLayer session: the events every page has, and its shared commands.
 * Each page's controller adds its own.
 */
export abstract class SeatLayerPageController<
  Hold extends SeatLayerPageHold,
  Events extends SeatLayerPageEvents<Hold> = SeatLayerPageEvents<Hold>,
> {
  /** @internal The session the page's renderer talks to. */
  readonly session: SeatLayerController;
  protected readonly events = new TypedEmitter<Events>();
  private currentHold: Hold | undefined;
  private currentConnection: SeatLayerConnectionState | undefined;
  private readonly continued = new Set<string>();
  private readonly bookedOperations = new Set<string>();
  private disposed = false;
  private readonly unsubscribe: (() => void)[];

  protected constructor(
    protected readonly surface: PageBridgeSurface,
    private readonly names: SeatLayerPageEventNames,
    session?: SeatLayerController,
  ) {
    this.session = session ?? new SeatLayerController();
    this.unsubscribe = [
      this.session.on('ready', (info) => this.emit('ready', info)),
      this.session.on('error', (error) => this.emit('error', error)),
      this.session.on('unknownEvent', ({ name, payload }) => {
        if (!this.disposed) this.handle(name, payload);
      }),
    ];
  }

  /** Whether a page is up and answered its handshake. */
  get isReady(): boolean {
    return this.session.isReady;
  }

  /** The hold the page has now. */
  get hold(): Hold | undefined {
    return this.currentHold;
  }

  /** The page's last word on its line to the server. */
  get connection(): SeatLayerConnectionState | undefined {
    return this.currentConnection;
  }

  on<K extends keyof Events>(name: K, listener: (value: Events[K]) => void): () => void {
    return this.events.on(name, listener);
  }

  /** Whether the page names `command` in its hello. */
  supportsCommand(command: string): boolean {
    return this.session.supportsSurfaceCommand(command);
  }

  /**
   * Tells the page the app went to the background or came back. Coming back
   * it reads the hold again; the answer says whether it is still held.
   */
  async setForeground(foreground: boolean): Promise<boolean | undefined> {
    const result = await this.run(`${this.surface}.lifecycle`, {
      state: foreground ? 'foreground' : 'background',
    });
    return asBoolean(asObject(result)?.held);
  }

  /** The room the app's own bars take around the page. Null clears it. */
  async setViewportInsets(insets: SeatLayerPageInsets | null): Promise<void> {
    await this.run(`${this.surface}.setViewportInsets`, insets === null
      ? { insets: null }
      : {
          top: insets.top ?? 0,
          right: insets.right ?? 0,
          bottom: insets.bottom ?? 0,
          left: insets.left ?? 0,
        });
  }

  /**
   * Your server booked `operationId`: the page shows it booked and never
   * releases it. Call it only after your server has booked.
   */
  async markBooked(options: { operationId?: string } = {}): Promise<string> {
    const result = await this.run(
      `${this.surface}.markBooked`,
      options.operationId === undefined ? {} : { operationId: options.operationId },
    );
    return asString(asObject(result)?.status) ?? 'pending';
  }

  /**
   * Tears the page down. A plain, unfinished hold is released first; a hold
   * that was continued, restored, booked or kept never is.
   */
  async destroy(): Promise<void> {
    try {
      await this.run(`${this.surface}.destroy`, {});
    } catch {
      // Best effort: the page may already be gone.
    }
    this.detach();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.session.dispose();
    this.currentHold = undefined;
    this.events.clear();
  }

  /** @internal Starts the page the renderer just opened. */
  beginHandshake(
    transport: BridgeTransport,
    configuration: SeatLayerSurfaceConfiguration,
    profile: BridgeProfile,
  ): Promise<ReadyInfo> {
    this.forgetPage();
    return this.session.beginSurfaceHandshake(transport, configuration, profile);
  }

  /** @internal The system ended the page: what it reported goes with it. */
  pageLost(): void {
    this.session.pageLost();
    this.forgetPage();
  }

  /** @internal The renderer went away. */
  detach(): void {
    this.session.disconnect(undefined, false);
    this.forgetPage();
  }

  protected run(command: string, payload?: JsonValue, untimed = false): Promise<JsonValue | undefined> {
    if (this.disposed) return Promise.reject(SeatLayerError.destroyed());
    return this.session.runSurfaceCommand(command, payload, { untimed });
  }

  protected emit<K extends keyof Events>(name: K, value: Events[K]): void {
    if (!this.disposed) this.events.emit(name, value);
  }

  /**
   * The page's own events, after the ones every page has. True: what the
   * picker draws may have changed; false: nothing it draws; undefined: not
   * an event this page knows.
   */
  protected abstract handlePageEvent(name: string, payload: JsonObject | undefined): boolean | undefined;

  /** Decodes a handoff the page sent; undefined when it is not one. */
  protected abstract decodeHold(value: unknown): Hold | undefined;

  /** A page that goes away takes its own state with it. */
  protected forgetPage(): void {
    this.currentHold = undefined;
    this.currentConnection = undefined;
  }

  protected setHold(hold: Hold | undefined): void {
    this.currentHold = hold;
    this.emit('hold', (hold ?? null) as Events['hold']);
  }

  /** Reports `hold` booked, once. */
  protected reportBooked(hold: Hold): void {
    if (this.bookedOperations.has(hold.operationId)) return;
    this.bookedOperations.add(hold.operationId);
    this.emit('booked', hold as Events['booked']);
  }

  private handle(name: string, payload: JsonValue | undefined): void {
    if (this.handleShared(name, payload)) this.emit('changed', undefined as Events['changed']);
  }

  private handleShared(name: string, payload: JsonValue | undefined): boolean {
    const object = asObject(payload) as JsonObject | undefined;
    const surface = this.surface;
    switch (name) {
      case `${surface}.hold`:
      case `${surface}.holdChanged`: {
        const hold = this.decodeHold(object?.handoff);
        if (hold === undefined && name === `${surface}.hold`) return false;
        this.setHold(hold);
        return true;
      }
      case `${surface}.holdExpired`:
        this.setHold(undefined);
        this.emit('holdExpired', undefined as Events['holdExpired']);
        return true;
      case this.names.continue: {
        const hold = this.decodeHold(object?.handoff);
        if (hold === undefined || this.continued.has(hold.operationId)) return false;
        this.continued.add(hold.operationId);
        this.emit('continue', hold as Events['continue']);
        return false;
      }
      case this.names.accessExpired: {
        const event = decodeBuyerAccessExpired(payload);
        if (event) this.emit('accessExpired', event as Events['accessExpired']);
        return false;
      }
      case this.names.accessUnavailable: {
        const event = decodeBuyerAccessUnavailable(payload);
        if (event) this.emit('accessUnavailable', event as Events['accessUnavailable']);
        return false;
      }
      case `${surface}.error`:
        this.emit('error', SeatLayerError.bridge(payload) as Events['error']);
        return false;
      case 'connection.changed': {
        const state = seatLayerConnectionStateFrom(object?.state);
        if (state === null || state === this.currentConnection) return false;
        this.currentConnection = state;
        this.emit('connection', state as Events['connection']);
        return true;
      }
      default: {
        const known = this.handlePageEvent(name, object);
        if (known === undefined) this.emit('unknownEvent', { name, payload } as Events['unknownEvent']);
        return known === true;
      }
    }
  }
}

/** A fresh caller-stable id: keep it to retry the same request. */
export function seatLayerPageOperationId(prefix: string): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(20);
  const crypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (typeof crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  let id = '';
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return `${prefix}_${id}`;
}

/** Epoch milliseconds a page sent, or undefined. */
export function seatLayerPageEpoch(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
}
