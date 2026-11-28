import { asArray, asInteger, asObject, asString, type JsonObject } from '../json';
import { decodeSeatLayerPickerBranding } from '../picker/decode';
import type { SeatLayerPickerBranding } from '../picker/models';
import { seatLayerPageEpoch, type SeatLayerPageHold } from '../surface/pageController';
import type { SeatLayerSeasonBookedStatus } from '../season/models';

/** The same seat for every performance, or a choice per performance. An open set. */
export type SeatLayerRunSelectionMode = 'same_seat' | 'per_performance' | (string & {});

/** One performance of the run, in its order. */
export interface SeatLayerRunPerformance {
  readonly position: number;
  readonly eventKey: string;
  readonly name: string;
  /** Milliseconds since the Unix epoch. */
  readonly startsAt?: number;
  /**
   * The start ready to print as it is, in the performance's zone and the
   * page's language: `Sat 15 Aug · 15:00`.
   */
  readonly startsAtLabel?: string;
  readonly salesState?: string;
}

/** The run the page shows: its name for the app's header, and its performances. */
export interface SeatLayerRunDescriptor {
  readonly key: string;
  readonly name: string;
  readonly performances: readonly SeatLayerRunPerformance[];
  /** `active`, `closing`, `closed` or `archived`. */
  readonly state?: string;
  /** `live` or `test`. */
  readonly mode?: string;
  readonly currency?: string;
  readonly venue?: string;
  /** The whole descriptor as the page sent it. */
  readonly json: JsonObject;
}

/** What the page tells the buyer. An open set. */
export type SeatLayerRunStatusKind =
  | 'idle'
  | 'pending'
  | 'recovery_failed'
  | 'sales_closed'
  | 'revision_changed'
  | 'session_ended'
  | (string & {});

/** The page's status line: decide on `kind`, never on `message`. */
export interface SeatLayerRunStatus {
  readonly kind: SeatLayerRunStatusKind;
  readonly message: string;
  /** On `recovery_failed`: the short reference to quote to support. */
  readonly reference?: string;
  /** The organizer's brand, from a page that sends it. */
  readonly branding?: SeatLayerPickerBranding;
}

/**
 * A run hold, handed to your checkout. It carries no price: your server
 * prices it and books it by `operationId`.
 */
export interface SeatLayerRunHandoff extends SeatLayerPageHold {
  /** The `pghop_` id the hold was made under. Book by it. */
  readonly operationId: string;
  readonly holdId: string;
  /** The performances the hold covers. */
  readonly performanceKeys: readonly string[];
  /** The seats the buyer chose. */
  readonly seatLabels: readonly string[];
  readonly selectionMode?: SeatLayerRunSelectionMode;
  /** The page learned the hold was booked. */
  readonly booked: boolean;
  /** The whole handoff as the page sent it, to forward to your server unchanged. */
  readonly json: JsonObject;
}

/** What `markBooked` found: the Season's words. */
export type SeatLayerRunBookedStatus = SeatLayerSeasonBookedStatus;

function strings(value: unknown): readonly string[] {
  return Object.freeze(asArray(value).filter((item): item is string => typeof item === 'string'));
}

export function decodeSeatLayerRunPerformance(value: unknown): SeatLayerRunPerformance | undefined {
  const object = asObject(value);
  const position = asInteger(object?.position);
  const eventKey = asString(object?.eventKey);
  const name = asString(object?.name);
  if (position === undefined || eventKey === undefined || name === undefined) return undefined;
  const startsAt = seatLayerPageEpoch(object?.startsAt);
  const startsAtLabel = asString(object?.startsAtLabel);
  const salesState = asString(object?.salesState);
  return {
    position,
    eventKey,
    name,
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(startsAtLabel === undefined ? {} : { startsAtLabel }),
    ...(salesState === undefined ? {} : { salesState }),
  };
}

export function decodeSeatLayerRunDescriptor(value: unknown): SeatLayerRunDescriptor | undefined {
  const object = asObject(value);
  const key = asString(object?.key);
  const name = asString(object?.name);
  if (object === undefined || key === undefined || name === undefined) return undefined;
  const state = asString(object.state);
  const mode = asString(object.mode);
  const currency = asString(object.currency);
  const venue = asString(object.venue);
  return {
    key,
    name,
    performances: Object.freeze(asArray(object.performances)
      .map(decodeSeatLayerRunPerformance)
      .filter((performance): performance is SeatLayerRunPerformance => performance !== undefined)),
    ...(state === undefined ? {} : { state }),
    ...(mode === undefined ? {} : { mode }),
    ...(currency === undefined ? {} : { currency }),
    ...(venue === undefined ? {} : { venue }),
    json: Object.freeze({ ...object }) as JsonObject,
  };
}

export function decodeSeatLayerRunStatus(value: unknown): SeatLayerRunStatus | undefined {
  const object = asObject(value);
  const kind = asString(object?.kind);
  if (kind === undefined) return undefined;
  const reference = asString(object?.reference);
  const branding = asObject(object?.branding);
  return {
    kind,
    message: asString(object?.message) ?? '',
    ...(reference === undefined ? {} : { reference }),
    ...(branding === undefined ? {} : { branding: decodeSeatLayerPickerBranding(branding) }),
  };
}

export function decodeSeatLayerRunHandoff(value: unknown): SeatLayerRunHandoff | undefined {
  const object = asObject(value);
  const operationId = asString(object?.operationId);
  const holdId = asString(object?.holdId);
  const expiresAt = seatLayerPageEpoch(object?.expiresAt);
  if (object === undefined || operationId === undefined || holdId === undefined || expiresAt === undefined) {
    return undefined;
  }
  const selectionMode = asString(object.selectionMode);
  return Object.freeze({
    operationId,
    holdId,
    expiresAt,
    performanceKeys: strings(object.performanceKeys),
    seatLabels: strings(object.seatLabels),
    ...(selectionMode === undefined ? {} : { selectionMode }),
    booked: asString(object.bookingState) === 'booked',
    json: Object.freeze({ ...object }) as JsonObject,
  });
}
