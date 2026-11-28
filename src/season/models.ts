import { asArray, asBoolean, asInteger, asObject, asString, type JsonObject } from '../json';
import { decodeSeatLayerPickerBranding } from '../picker/decode';
import type { SeatLayerPickerBranding } from '../picker/models';
import { seatLayerPageEpoch, type SeatLayerPageHold } from '../surface/pageController';

/** Where a Season stands, as its status line says. An open set. */
export type SeatLayerSeasonStatusKind =
  | 'loading'
  | 'ready'
  | 'pending'
  | 'held'
  | 'booked'
  | 'released'
  | 'renewal_intent'
  | 'partial_terminal'
  | 'failed'
  | (string & {});

/** One date of the Season's package. */
export interface SeatLayerSeasonDate {
  readonly position: number;
  readonly eventKey: string;
  readonly name: string;
  /** Milliseconds since the Unix epoch. */
  readonly startsAt?: number;
  /** The date as the page writes it. */
  readonly startsAtLabel?: string;
  readonly past: boolean;
  readonly cancelled: boolean;
}

/** The Season page's status line: loading, ready (with the dates), held, booked… */
export interface SeatLayerSeasonStatus {
  readonly kind: SeatLayerSeasonStatusKind;
  readonly message: string;
  readonly operationId?: string;
  readonly dates?: readonly SeatLayerSeasonDate[];
  /** The Season's name, once the page has read it. */
  readonly seasonName?: string;
  /** The organizer's brand, once the page has read it. */
  readonly branding?: SeatLayerPickerBranding;
}

/** A Season hold handed to your checkout. Book it on your server at your prices. */
export interface SeatLayerSeasonHandoff extends SeatLayerPageHold {
  readonly seasonKey: string;
  readonly planActivationId: string;
  readonly holdId: string;
  /** Everything the page sent, for your server. */
  readonly json: JsonObject;
}

/** The held order as the page prices it. */
export interface SeatLayerSeasonHeldOrder {
  readonly operationId: string;
  readonly expiresAt: number;
  readonly currency: string;
  readonly seats: readonly unknown[];
  readonly totalMinor?: number;
}

/**
 * How a close the buyer asked for ended: `closed` (nothing held), `released`,
 * `kept` (reopen on the hold with `initialOperationId`), `stayed` (the buyer
 * did not leave) or `booked`. An open set.
 */
export type SeatLayerSeasonCloseOutcome =
  | 'closed'
  | 'released'
  | 'kept'
  | 'stayed'
  | 'booked'
  | (string & {});

/** What `markBooked` found. An open set. */
export type SeatLayerSeasonBookedStatus =
  | 'booked'
  | 'already_booked'
  | 'pending'
  | 'nothing_held'
  | 'different_hold'
  | (string & {});

export function decodeSeatLayerSeasonDate(value: unknown): SeatLayerSeasonDate | undefined {
  const object = asObject(value);
  const position = asInteger(object?.position);
  const eventKey = asString(object?.eventKey);
  const name = asString(object?.name);
  if (position === undefined || eventKey === undefined || name === undefined) return undefined;
  const startsAt = seatLayerPageEpoch(object?.startsAt);
  const startsAtLabel = asString(object?.startsAtLabel);
  return {
    position,
    eventKey,
    name,
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(startsAtLabel === undefined ? {} : { startsAtLabel }),
    past: asBoolean(object?.past) ?? false,
    cancelled: asBoolean(object?.cancelled) ?? false,
  };
}

export function decodeSeatLayerSeasonStatus(value: unknown): SeatLayerSeasonStatus | undefined {
  const object = asObject(value);
  const kind = asString(object?.kind);
  if (kind === undefined) return undefined;
  const operationId = asString(object?.operationId);
  const seasonName = asString(asObject(object?.season)?.name);
  const branding = asObject(object?.branding);
  return {
    kind,
    message: asString(object?.message) ?? '',
    ...(operationId === undefined ? {} : { operationId }),
    ...(Array.isArray(object?.dates)
      ? {
          dates: asArray(object?.dates)
            .map(decodeSeatLayerSeasonDate)
            .filter((date): date is SeatLayerSeasonDate => date !== undefined),
        }
      : {}),
    ...(seasonName === undefined ? {} : { seasonName }),
    ...(branding === undefined ? {} : { branding: decodeSeatLayerPickerBranding(branding) }),
  };
}

export function decodeSeatLayerSeasonHandoff(value: unknown): SeatLayerSeasonHandoff | undefined {
  const object = asObject(value);
  const seasonKey = asString(object?.seasonKey);
  const planActivationId = asString(object?.planActivationId);
  const operationId = asString(object?.operationId);
  const holdId = asString(object?.holdId);
  const expiresAt = seatLayerPageEpoch(object?.expiresAt);
  if (
    object === undefined || seasonKey === undefined || planActivationId === undefined ||
    operationId === undefined || holdId === undefined || expiresAt === undefined
  ) return undefined;
  return Object.freeze({
    seasonKey,
    planActivationId,
    operationId,
    holdId,
    expiresAt,
    json: Object.freeze({ ...object }) as JsonObject,
  });
}

export function decodeSeatLayerSeasonHeldOrder(value: unknown): SeatLayerSeasonHeldOrder | undefined {
  const object = asObject(value);
  const operationId = asString(object?.operationId);
  const expiresAt = seatLayerPageEpoch(object?.expiresAt);
  const currency = asString(object?.currency);
  if (operationId === undefined || expiresAt === undefined || currency === undefined) return undefined;
  const totalMinor = asInteger(object?.totalMinor);
  return {
    operationId,
    expiresAt,
    currency,
    seats: Object.freeze([...asArray(object?.seats)]),
    ...(totalMinor === undefined ? {} : { totalMinor }),
  };
}
