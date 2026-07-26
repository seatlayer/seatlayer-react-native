import { SeatLayerError } from '../errors';
import type { JsonValue } from '../json';
import type { Envelope } from './envelope';

export interface BridgeTransport {
  send(envelope: Envelope): void | Promise<void>;
}

export type BridgeSignal =
  | { kind: 'hello'; payload: JsonValue | undefined }
  | {
      kind: 'event';
      name: string;
      payload: JsonValue | undefined;
      sequence: number;
    }
  | { kind: 'unhandled'; envelope: Envelope };

interface Pending {
  command: string;
  order: number;
  resolve(value: JsonValue | undefined): void;
  reject(reason: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

const failableCommands = new Set([
  'hold',
  'holdGA',
  'bestAvailable',
  'resumeHold',
  'extendHold',
  'release',
  'releaseLabels',
]);

export class BridgeClient {
  private readonly pending = new Map<string, Pending>();
  private readonly lastSequence = new Map<string, number>();
  private nextId = 0;
  private closed = false;
  private signalHandler: ((signal: BridgeSignal) => void) | undefined;

  constructor(
    private readonly transport: BridgeTransport,
    readonly timeoutMs = 15_000,
  ) {}

  onSignal(handler: (signal: BridgeSignal) => void): void {
    this.signalHandler = handler;
  }

  command(name: string, payload?: JsonValue): Promise<JsonValue | undefined> {
    if (this.closed) return Promise.reject(SeatLayerError.destroyed());
    const order = ++this.nextId;
    const id = `rn${order}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        entry.reject(SeatLayerError.timeout(entry.command, this.timeoutMs));
      }, this.timeoutMs);

      this.pending.set(id, { command: name, order, resolve, reject, timer });
      Promise.resolve(
        this.transport.send({
          kind: 'cmd',
          type: name,
          id,
          ...(payload === undefined ? {} : { payload }),
        }),
      ).catch(() => {
        // The command timeout remains the single transport-failure backstop.
      });
    });
  }

  sendInit(payload: JsonValue): void {
    if (this.closed) return;
    Promise.resolve(
      this.transport.send({ kind: 'init', type: 'init', payload }),
    ).catch(() => {});
  }

  ingest(envelope: Envelope): void {
    if (this.closed) return;
    switch (envelope.kind) {
      case 'hello':
        this.signalHandler?.({ kind: 'hello', payload: envelope.payload });
        return;
      case 'res':
        this.take(envelope.id)?.resolve(envelope.payload);
        return;
      case 'err':
        this.take(envelope.id)?.reject(SeatLayerError.bridge(envelope.payload));
        return;
      case 'evt':
        this.ingestEvent(envelope);
        return;
      default:
        this.signalHandler?.({ kind: 'unhandled', envelope });
    }
  }

  close(error: SeatLayerError = SeatLayerError.destroyed()): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.lastSequence.clear();
    this.signalHandler = undefined;
  }

  get openCommandCount(): number {
    return this.pending.size;
  }

  highestSequenceFor(name: string): number | undefined {
    return this.lastSequence.get(name);
  }

  private take(id: string | undefined): Pending | undefined {
    if (!id) return undefined;
    const pending = this.pending.get(id);
    if (!pending) return undefined;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    return pending;
  }

  private ingestEvent(envelope: Envelope): void {
    if (envelope.type === 'error') {
      const command = this.mostRecentFailableCommand();
      if (command) {
        this.pending.delete(command.id);
        clearTimeout(command.pending.timer);
        command.pending.reject(SeatLayerError.bridge(envelope.payload));
        return;
      }
    }

    const sequence = envelope.sequence ?? Number.MIN_SAFE_INTEGER;
    const seen = this.lastSequence.get(envelope.type);
    if (seen !== undefined && sequence <= seen) return;
    this.lastSequence.set(envelope.type, sequence);
    this.signalHandler?.({
      kind: 'event',
      name: envelope.type,
      payload: envelope.payload,
      sequence,
    });
  }

  private mostRecentFailableCommand():
    | { id: string; pending: Pending }
    | undefined {
    let best: { id: string; pending: Pending } | undefined;
    for (const [id, pending] of this.pending) {
      if (!failableCommands.has(pending.command)) continue;
      if (!best || pending.order > best.pending.order) best = { id, pending };
    }
    return best;
  }
}
