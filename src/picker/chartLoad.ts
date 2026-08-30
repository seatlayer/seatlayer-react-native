import type { JsonObject, JsonValue } from '../json';
import type { ReadyInfo } from '../types';

export interface SeatLayerChartLoadTrace {
  readonly raw: JsonObject;
  readonly event?: string;
  readonly scope?: string;
  readonly surface?: string;
  readonly outcome?: string;
  readonly stage?: string;
  readonly ms?: number;
  readonly api?: number;
  readonly scene?: number;
  readonly panel?: number;
  readonly paint?: number;
  readonly normalize?: number;
  readonly renderer?: number;
  readonly availabilityMs?: number;
  readonly seats?: number;
  readonly floors?: number;
  readonly view?: string;
  readonly load?: string;
  readonly transport?: string;
  readonly chartBytes?: number;
  readonly chartCache?: string;
  readonly server?: number;
  readonly r2Head?: number;
  readonly cacheLookup?: number;
  readonly r2Get?: number;
  readonly transform?: number;
  readonly host?: string;
  readonly platform?: string;
  readonly bundle?: string;
  readonly protocol?: number;
  readonly chromeOwner?: string;
  readonly bootMs?: number;
  readonly documentMs?: number;
  readonly handshakeMs?: number;
  /** A missing outcome remains successful for older compatible runtimes. */
  readonly succeeded: boolean;
}

export interface SeatLayerChartLoad {
  readonly trace: SeatLayerChartLoadTrace;
  readonly tapToReadyMs: number | null;
  readonly ready: Readonly<ReadyInfo> | null;
  readonly hostMs: number | null;
}

export type SeatLayerChartLoadClock = () => number;

type CloneResult = Readonly<{ valid: boolean; value?: JsonValue }>;

const maxTraceDepth = 32;
const maxTraceNodes = 4_096;
const maxTraceCollectionLength = 1_024;

function cloneResult(value: JsonValue): CloneResult {
  return Object.freeze({ valid: true, value });
}

function invalidClone(): CloneResult {
  return Object.freeze({ valid: false });
}

function ownData(value: unknown, key: string): unknown {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isPlainObject(value: object): boolean {
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function cloneJson(
  value: unknown,
  seen = new Set<object>(),
  depth = 0,
  budget: { nodes: number } = { nodes: 0 },
): CloneResult {
  budget.nodes += 1;
  if (depth > maxTraceDepth || budget.nodes > maxTraceNodes) return invalidClone();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return cloneResult(value);
  if (typeof value === 'number') return Number.isFinite(value) ? cloneResult(value) : invalidClone();
  if (typeof value !== 'object' || value === null || seen.has(value)) return invalidClone();
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      let length: unknown;
      try {
        const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
        length = descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
      } catch {
        return invalidClone();
      }
      const safeLength = typeof length === 'number' && Number.isSafeInteger(length) &&
        length >= 0 && length <= maxTraceCollectionLength ? length : undefined;
      if (safeLength === undefined) return invalidClone();
      const output: JsonValue[] = [];
      for (let index = 0; index < safeLength; index += 1) {
        let descriptor: PropertyDescriptor | undefined;
        try { descriptor = Object.getOwnPropertyDescriptor(value, String(index)); } catch { return invalidClone(); }
        if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return invalidClone();
        const child = cloneJson(descriptor.value, seen, depth + 1, budget);
        if (!child.valid) return invalidClone();
        output.push(child.value!);
      }
      let keys: string[];
      try { keys = Object.keys(value); } catch { return invalidClone(); }
      if (keys.some((key) => !/^(0|[1-9]\d*)$/.test(key))) return invalidClone();
      return cloneResult(Object.freeze(output) as unknown as JsonValue);
    }
    if (!isPlainObject(value)) return invalidClone();
    let keys: string[];
    let symbols: symbol[];
    try {
      keys = Object.keys(value);
      symbols = Object.getOwnPropertySymbols(value);
    } catch {
      return invalidClone();
    }
    if (symbols.length > 0 || keys.length > maxTraceCollectionLength) return invalidClone();
    const output: Record<string, JsonValue> = {};
    for (const key of keys) {
      let descriptor: PropertyDescriptor | undefined;
      try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { return invalidClone(); }
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return invalidClone();
      const child = cloneJson(descriptor.value, seen, depth + 1, budget);
      if (!child.valid) return invalidClone();
      Object.defineProperty(output, key, {
        configurable: false,
        enumerable: true,
        value: child.value!,
        writable: false,
      });
    }
    return cloneResult(Object.freeze(output) as JsonObject);
  } finally {
    seen.delete(value);
  }
}

function stringAt(raw: JsonObject, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' ? value : undefined;
}

function integerAt(raw: JsonObject, key: string): number | undefined {
  const value = raw[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Decodes the open runtime trace while retaining every safely cloned field in raw. */
export function decodeSeatLayerChartLoadTrace(value: unknown): SeatLayerChartLoadTrace | undefined {
  const clone = cloneJson(value);
  if (!clone.valid || clone.value === null || Array.isArray(clone.value) || typeof clone.value !== 'object') return undefined;
  const raw = clone.value as JsonObject;
  const outcome = stringAt(raw, 'outcome');
  return Object.freeze({
    raw,
    event: stringAt(raw, 'event'), scope: stringAt(raw, 'scope'), surface: stringAt(raw, 'surface'),
    outcome, stage: stringAt(raw, 'stage'), ms: integerAt(raw, 'ms'), api: integerAt(raw, 'api'),
    scene: integerAt(raw, 'scene'), panel: integerAt(raw, 'panel'), paint: integerAt(raw, 'paint'),
    normalize: integerAt(raw, 'normalize'), renderer: integerAt(raw, 'renderer'),
    availabilityMs: integerAt(raw, 'availabilityMs'), seats: integerAt(raw, 'seats'), floors: integerAt(raw, 'floors'),
    view: stringAt(raw, 'view'), load: stringAt(raw, 'load'), transport: stringAt(raw, 'transport'),
    chartBytes: integerAt(raw, 'chartBytes'), chartCache: stringAt(raw, 'chartCache'), server: integerAt(raw, 'server'),
    r2Head: integerAt(raw, 'r2Head'), cacheLookup: integerAt(raw, 'cacheLookup'), r2Get: integerAt(raw, 'r2Get'),
    transform: integerAt(raw, 'transform'), host: stringAt(raw, 'host'), platform: stringAt(raw, 'platform'),
    bundle: stringAt(raw, 'bundle'), protocol: integerAt(raw, 'protocol'), chromeOwner: stringAt(raw, 'chromeOwner'),
    bootMs: integerAt(raw, 'bootMs'), documentMs: integerAt(raw, 'documentMs'), handshakeMs: integerAt(raw, 'handshakeMs'),
    succeeded: outcome === undefined || outcome === 'success',
  });
}

/** Decodes only the trace nested in an advertised telemetry.chartLoad event. */
export function decodeSeatLayerChartLoadEvent(payload: unknown): SeatLayerChartLoadTrace | undefined {
  return decodeSeatLayerChartLoadTrace(ownData(payload, 'trace'));
}

function safeMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function freezeReadyInfo(value: ReadyInfo | undefined): Readonly<ReadyInfo> | null {
  if (value === undefined) return null;
  const protocolRevision = ownData(value, 'protocolRevision');
  const safeProtocolRevision = typeof protocolRevision === 'number' && Number.isInteger(protocolRevision)
    ? protocolRevision
    : undefined;
  if (safeProtocolRevision === undefined) return null;
  const raw = ownData(value, 'raw');
  const rawClone = raw === undefined ? undefined : cloneJson(raw);
  if (rawClone !== undefined && !rawClone.valid) return null;
  const mode = ownData(value, 'mode');
  const platform = ownData(value, 'platform');
  const eventKey = ownData(value, 'eventKey');
  const timeToHelloMs = safeMs(ownData(value, 'timeToHelloMs'));
  const timeToReadyMs = safeMs(ownData(value, 'timeToReadyMs'));
  return Object.freeze({
    protocolRevision: safeProtocolRevision,
    ...(typeof mode === 'string' ? { mode } : {}),
    ...(typeof platform === 'string' ? { platform } : {}),
    ...(typeof eventKey === 'string' ? { eventKey } : {}),
    ...(timeToHelloMs === null ? {} : { timeToHelloMs }),
    ...(timeToReadyMs === null ? {} : { timeToReadyMs }),
    raw: rawClone?.value,
  });
}

/** Uses RN's monotonic performance clock without falling back to wall-clock time. */
export const seatLayerChartLoadNow: SeatLayerChartLoadClock = () => {
  try {
    const now = globalThis.performance?.now?.();
    return typeof now === 'number' && Number.isFinite(now) && now >= 0 ? now : 0;
  } catch {
    return 0;
  }
};

/** Tracks one scope mount or accepted retry without retaining previous render timing. */
export class SeatLayerChartLoadAttempt {
  private startedAt: number | null = null;
  private ready: Readonly<ReadyInfo> | null = null;
  private tapToReadyMs: number | null = null;

  constructor(private readonly clock: SeatLayerChartLoadClock = seatLayerChartLoadNow) {}

  begin(startedAt: number = this.clock()): void {
    this.startedAt = safeMs(startedAt);
    this.ready = null;
    this.tapToReadyMs = null;
  }

  markReady(info: ReadyInfo | undefined): void {
    if (this.ready !== null || this.startedAt === null) return;
    const ready = freezeReadyInfo(info);
    if (ready === null) return;
    this.ready = ready;
    const now = safeMs(this.clock());
    this.tapToReadyMs = now === null ? null : Math.max(0, now - this.startedAt);
  }

  merge(trace: SeatLayerChartLoadTrace): SeatLayerChartLoad {
    const hostMs = this.tapToReadyMs === null || trace.bootMs === undefined
      ? null
      : Math.max(0, this.tapToReadyMs - trace.bootMs);
    return Object.freeze({ trace, tapToReadyMs: this.tapToReadyMs, ready: this.ready, hostMs });
  }
}
