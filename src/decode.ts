import {
  asArray,
  asFiniteNumber,
  asInteger,
  asObject,
  asString,
  type JsonValue,
} from './json';
import { decodeProtocolRange, nativeProtocolRange } from './bridge/protocol';
import type {
  BestAvailableResult,
  BundleInfo,
  CategoryTier,
  FloorInfo,
  GAArea,
  HoldLineItem,
  HoldResult,
  ReadyInfo,
  SeatCommercialAttributes,
  SeatHoverDetails,
  SelectedSeat,
} from './types';

function strings(value: unknown): string[] {
  return asArray(value)
    .map(asString)
    .filter((item): item is string => item !== undefined);
}

function decodeTier(value: unknown): CategoryTier | undefined {
  const object = asObject(value);
  const id = asString(object?.id);
  const name = asString(object?.name);
  const price = asFiniteNumber(object?.price);
  return id && name && price !== undefined ? { id, name, price } : undefined;
}

function decodeCommercial(
  value: unknown,
): SeatCommercialAttributes | undefined {
  const object = asObject(value);
  if (!object) return undefined;
  return {
    ...(typeof object.restrictedView === 'boolean'
      ? { restrictedView: object.restrictedView }
      : {}),
    ...(typeof object.obstructedView === 'boolean'
      ? { obstructedView: object.obstructedView }
      : {}),
    ...(typeof object.premium === 'boolean' ? { premium: object.premium } : {}),
    ...(asString(object.note) === undefined ? {} : { note: asString(object.note) }),
  };
}

export function decodeSelectedSeat(value: unknown): SelectedSeat | undefined {
  const object = asObject(value);
  const id = asString(object?.id);
  const label = asString(object?.label);
  if (!id || !label) return undefined;
  const tiers = asArray(object?.tiers)
    .map(decodeTier)
    .filter((item): item is CategoryTier => item !== undefined);
  return {
    id,
    label,
    ...(asString(object?.displayLabel) === undefined
      ? {}
      : { displayLabel: asString(object?.displayLabel) }),
    ...(asString(object?.categoryKey) === undefined
      ? {}
      : { categoryKey: asString(object?.categoryKey) }),
    ...(asFiniteNumber(object?.price) === undefined
      ? {}
      : { price: asFiniteNumber(object?.price) }),
    ...(tiers.length === 0 ? {} : { tiers }),
    ...(asString(object?.tierId) === undefined
      ? {}
      : { tierId: asString(object?.tierId) }),
    ...(decodeCommercial(object?.commercial) === undefined
      ? {}
      : { commercial: decodeCommercial(object?.commercial) }),
  } as SelectedSeat;
}

function decodeLineItem(value: unknown): HoldLineItem | undefined {
  const object = asObject(value);
  const label = asString(object?.label);
  if (!label) return undefined;
  return {
    label,
    ...(asString(object?.objectId) === undefined
      ? {}
      : { objectId: asString(object?.objectId) }),
    ...(asString(object?.objectType) === undefined
      ? {}
      : { objectType: asString(object?.objectType) }),
    ...(asString(object?.categoryKey) === undefined
      ? {}
      : { categoryKey: asString(object?.categoryKey) }),
    ...(asString(object?.tierId) === undefined
      ? {}
      : { tierId: asString(object?.tierId) }),
    ...(asFiniteNumber(object?.unitPrice) === undefined
      ? {}
      : { unitPrice: asFiniteNumber(object?.unitPrice) }),
    ...(asString(object?.currency) === undefined
      ? {}
      : { currency: asString(object?.currency) }),
    ...(asInteger(object?.quantity) === undefined
      ? {}
      : { quantity: asInteger(object?.quantity) }),
  } as HoldLineItem;
}

export function decodeHold(value: unknown): HoldResult | undefined {
  const object = asObject(value);
  const holdId = asString(object?.holdId);
  const expiresAt = asFiniteNumber(object?.expiresAt);
  if (!holdId || expiresAt === undefined) return undefined;
  const seats = asArray(object?.seats)
    .map(decodeSelectedSeat)
    .filter((item): item is SelectedSeat => item !== undefined);
  const items = asArray(object?.items)
    .map(decodeLineItem)
    .filter((item): item is HoldLineItem => item !== undefined);
  return {
    holdId,
    expiresAt,
    ...(object?.seats === undefined ? {} : { seats }),
    ...(object?.items === undefined ? {} : { items }),
  };
}

export function decodeBestAvailable(
  value: unknown,
): BestAvailableResult | undefined {
  const hold = decodeHold(value);
  if (!hold) return undefined;
  return { ...hold, labels: strings(asObject(value)?.labels) };
}

export function decodeGAArea(value: unknown): GAArea | undefined {
  const object = asObject(value);
  const id = asString(object?.id);
  if (!id) return undefined;
  const tiers = asArray(object?.tiers)
    .map(decodeTier)
    .filter((item): item is CategoryTier => item !== undefined);
  return {
    id,
    ...(asString(object?.label) === undefined
      ? {}
      : { label: asString(object?.label) }),
    ...(asInteger(object?.capacity) === undefined
      ? {}
      : { capacity: asInteger(object?.capacity) }),
    ...(asInteger(object?.available) === undefined
      ? {}
      : { available: asInteger(object?.available) }),
    ...(asString(object?.categoryKey) === undefined
      ? {}
      : { categoryKey: asString(object?.categoryKey) }),
    ...(asFiniteNumber(object?.price) === undefined
      ? {}
      : { price: asFiniteNumber(object?.price) }),
    ...(asString(object?.currency) === undefined
      ? {}
      : { currency: asString(object?.currency) }),
    ...(tiers.length === 0 ? {} : { tiers }),
  } as GAArea;
}

export function decodeFloor(value: unknown): FloorInfo | undefined {
  const object = asObject(value);
  const id = asString(object?.id);
  if (!id) return undefined;
  return {
    id,
    ...(asString(object?.label) === undefined
      ? {}
      : { label: asString(object?.label) }),
    ...(asFiniteNumber(object?.level) === undefined
      ? {}
      : { level: asFiniteNumber(object?.level) }),
  } as FloorInfo;
}

export function decodeSeatHover(
  value: unknown,
): SeatHoverDetails | undefined {
  const object = asObject(value);
  if (!object) return undefined;
  return {
    ...(asString(object.seatId) === undefined
      ? {}
      : { seatId: asString(object.seatId) }),
    ...(asString(object.label) === undefined
      ? {}
      : { label: asString(object.label) }),
    ...(asString(object.displayLabel) === undefined
      ? {}
      : { displayLabel: asString(object.displayLabel) }),
    ...(asString(object.categoryKey) === undefined
      ? {}
      : { categoryKey: asString(object.categoryKey) }),
    ...(asFiniteNumber(object.price) === undefined
      ? {}
      : { price: asFiniteNumber(object.price) }),
    ...(asString(object.status) === undefined
      ? {}
      : { status: asString(object.status) }),
  } as SeatHoverDetails;
}

export function decodeBundleInfo(value: JsonValue | undefined): BundleInfo {
  const object = asObject(value);
  return {
    protocol: decodeProtocolRange(object?.protocol) ?? nativeProtocolRange,
    ...(asString(object?.bundle) === undefined
      ? {}
      : { version: asString(object?.bundle) }),
    commands: strings(object?.commands),
    events: strings(object?.events),
    raw: value,
  };
}

export function decodeReadyInfo(value: JsonValue | undefined): ReadyInfo {
  const object = asObject(value);
  const chart = asObject(object?.chart);
  return {
    protocolRevision: asInteger(object?.protocol) ?? nativeProtocolRange.max,
    ...(asString(object?.mode) === undefined
      ? {}
      : { mode: asString(object?.mode) }),
    ...(asString(object?.transport) === undefined
      ? {}
      : { platform: asString(object?.transport) }),
    ...(asString(chart?.event) === undefined
      ? {}
      : { eventKey: asString(chart?.event) }),
    raw: value,
  };
}
