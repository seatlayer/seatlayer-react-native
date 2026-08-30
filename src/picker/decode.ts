import {
  decodeGAArea,
  decodeSelectedSeat,
  decodeSelectionValidity,
} from '../decode';
import {
  asArray,
  asBoolean,
  asFiniteNumber,
  asInteger,
  asObject,
  asString,
  type JsonValue,
} from '../json';
import type { CategoryTier, GAArea, SelectedSeat } from '../types';
import {
  type SeatLayerPickerAccessNeed,
  type SeatLayerPickerCartLine,
  type SeatLayerPickerCategory,
  type SeatLayerPickerCheckoutHandoff,
  type SeatLayerPickerFloorInfo,
  type SeatLayerPickerSectionSummary,
  type SeatLayerPickerSnapshot,
  seatLayerPickerSnapshotSchema,
  type SeatLayerPickerViewportInsets,
  type SeatLayerPickerZone,
  type SeatLayerSeatView,
} from './models';

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      freeze(entry);
    }
    Object.freeze(value);
  }
  return value;
};

const jsonClone = (value: unknown): JsonValue => {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
};

function strings(value: unknown): string[] {
  return asArray(value)
    .map(asString)
    .filter((item): item is string => item !== undefined);
}

function uniqueStrings(value: unknown): string[] {
  const seen = new Set<string>();
  return strings(value).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function numberOr(value: unknown, fallback = 0): number {
  return asFiniteNumber(value) ?? fallback;
}

function optionalStrings(
  object: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = asString(object?.[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function decodeTier(value: unknown): CategoryTier | undefined {
  const item = asObject(value);
  const id = asString(item?.id);
  const name = asString(item?.name);
  const price = asFiniteNumber(item?.price);
  if (!id || !name || price === undefined) return undefined;
  return freeze({
    id,
    name,
    price,
    ...(asString(item?.currency) === undefined
      ? {}
      : { currency: asString(item?.currency) }),
    ...(asString(item?.restriction) === undefined
      ? {}
      : { restriction: asString(item?.restriction) }),
    ...(asString(item?.buyerMessage) === undefined
      ? {}
      : { buyerMessage: asString(item?.buyerMessage) }),
  });
}

function decodeZone(value: unknown): SeatLayerPickerZone | undefined {
  const item = asObject(value);
  const id = asString(item?.id);
  if (!id) return undefined;
  return freeze({
    id,
    label: asString(item?.label) ?? id,
    ...optionalStrings(item, ['color']),
  });
}

function decodeSection(
  value: unknown,
): SeatLayerPickerSectionSummary | undefined {
  const item = asObject(value);
  const id = asString(item?.id);
  if (!id) return undefined;
  const numbers: Record<string, number> = {};
  for (const key of ['seatsLeft', 'priceMin', 'priceMax']) {
    const number = asFiniteNumber(item?.[key]);
    if (number !== undefined) numbers[key] = number;
  }
  return freeze({
    id,
    label: asString(item?.label) ?? id,
    ...optionalStrings(item, [
      'displayLabel',
      'zoneId',
      'zoneLabel',
      'entrance',
      'color',
      'dominantCategoryKey',
    ]),
    ...numbers,
  });
}

function decodeCartLine(value: unknown): SeatLayerPickerCartLine | undefined {
  const item = asObject(value);
  const label = asString(item?.label);
  if (!label) return undefined;
  const objectId = asString(item?.objectId) ?? label;
  return freeze({
    lineKey: asString(item?.lineKey) ?? asString(item?.key) ?? objectId,
    label,
    objectId,
    objectType: asString(item?.objectType) ?? 'seat',
    categoryKey: asString(item?.categoryKey) ?? '',
    unitPrice: numberOr(item?.unitPrice),
    currency: asString(item?.currency) ?? 'USD',
    quantity: asInteger(item?.quantity) ?? 1,
    ...optionalStrings(item, [
      'displayLabel',
      'displayType',
      'tierId',
      'seatId',
      'sectionLabel',
      'rowLabel',
      'seatNumber',
    ]),
  });
}

function decodeInsets(
  value: unknown,
): SeatLayerPickerViewportInsets | undefined {
  const item = asObject(value);
  if (!item) return undefined;
  return freeze({
    top: Math.max(0, numberOr(item.top)),
    right: Math.max(0, numberOr(item.right)),
    bottom: Math.max(0, numberOr(item.bottom)),
    left: Math.max(0, numberOr(item.left)),
  });
}

function decodePickerFloor(
  value: unknown,
): SeatLayerPickerFloorInfo | undefined {
  const floor = asObject(value);
  const id = asString(floor?.id);
  const name = asString(floor?.name);
  const level = asInteger(floor?.level);
  if (!id || !name) return undefined;
  return freeze({
    id,
    name,
    ...(level === undefined ? {} : { level }),
  });
}

function decodeAccessNeed(value: unknown): SeatLayerPickerAccessNeed | undefined {
  const item = asObject(value);
  const key = asString(item?.key)?.trim();
  if (!key) return undefined;
  return freeze({ key, count: Math.max(0, asInteger(item?.count) ?? 0) });
}

function decodeCategory(value: unknown): SeatLayerPickerCategory | undefined {
  const item = asObject(value);
  const key = asString(item?.key);
  if (!key) return undefined;
  const tiers = asArray(item?.tiers)
    .map(decodeTier)
    .filter((entry): entry is CategoryTier => entry !== undefined);
  const prices = tiers.map((entry) => entry.price);
  const base = numberOr(item?.price, prices[0] ?? 0);
  return freeze({
    key,
    label: asString(item?.label) ?? key,
    color: asString(item?.color) ?? '#6e7bff',
    priceMin: numberOr(
      item?.priceMin,
      prices.length ? Math.min(...prices) : base,
    ),
    priceMax: numberOr(
      item?.priceMax,
      prices.length ? Math.max(...prices) : base,
    ),
    available: asInteger(item?.available) ?? 0,
    notForSale: asBoolean(item?.notForSale) ?? false,
    tiers: freeze(tiers),
  });
}

function enabledCapabilities(value: unknown): string[] {
  const features = asObject(value);
  if (!features) return [];
  return Object.entries(features).flatMap(([name, enabled]) => {
    return enabled === true || (Array.isArray(enabled) && enabled.length > 0)
      ? [name]
      : [];
  });
}

/** Tolerant on additive fields; rejects only an invalid v1 identity. */
export function decodeSeatLayerPickerSnapshot(
  value: unknown,
): SeatLayerPickerSnapshot | undefined {
  const root = asObject(value);
  const schema = asString(root?.schema);
  const sessionId = asString(root?.sessionId);
  const revision = asInteger(root?.revision);
  const event = asObject(root?.event);
  const key = asString(event?.key);
  if (
    schema !== seatLayerPickerSnapshotSchema || !sessionId ||
    revision === undefined || !key
  ) {
    return undefined;
  }
  const catalog = asObject(root?.catalog);
  const selection = asObject(root?.selection);
  const cart = asObject(root?.cart);
  const hold = asObject(root?.hold);
  const access = asObject(root?.access);
  const map = asObject(root?.map);
  const branding = asObject(root?.branding);
  const tokens = asObject(branding?.tokens);
  const categories = asArray(catalog?.categories)
    .map(decodeCategory)
    .filter((entry): entry is SeatLayerPickerCategory => entry !== undefined);
  const zones = asArray(catalog?.zones)
    .map(decodeZone)
    .filter((entry): entry is SeatLayerPickerZone => entry !== undefined);
  const sections = asArray(catalog?.sections)
    .map(decodeSection)
    .filter((entry): entry is SeatLayerPickerSectionSummary =>
      entry !== undefined
    );
  const generalAdmissionAreas = asArray(catalog?.gaAreas)
    .map(decodeGAArea)
    .filter((entry): entry is GAArea => entry !== undefined);
  const bestAvailableZones = asArray(catalog?.bestAvailableZones)
    .map(decodeZone)
    .filter((entry): entry is SeatLayerPickerZone => entry !== undefined);
  const cartLines = asArray(cart?.items ?? cart?.lines)
    .map(decodeCartLine)
    .filter((entry): entry is SeatLayerPickerCartLine => entry !== undefined);
  const seats = asArray(selection?.seats)
    .map(decodeSelectedSeat)
    .filter((entry): entry is SelectedSeat => entry !== undefined)
    .map(freeze);
  const selectionValidity = decodeSelectionValidity(selection?.validity);
  const activeFloorId = asString(map?.activeFloorId) ?? asString(map?.floorId);
  const targetSeatId = asString(map?.view3dTargetSeatId);
  const targetSeat = decodeSelectedSeat(map?.view3dTargetSeat);
  const previousSeatId = asString(map?.view3dPreviousSeatId);
  const nextSeatId = asString(map?.view3dNextSeatId);
  const view3DFocusedSectionId = asString(map?.view3dFocusedSectionId);
  const reportsPreviousSeat = map !== undefined && Object.prototype.hasOwnProperty.call(map, 'view3dPreviousSeatId');
  const reportsNextSeat = map !== undefined && Object.prototype.hasOwnProperty.call(map, 'view3dNextSeatId');
  const reportsView3DFocus = map !== undefined && Object.prototype.hasOwnProperty.call(map, 'view3dFocusedSectionId');
  const focusedSection = decodeSection(map?.focusedSection);
  const rung = asString(map?.rung) ?? 'overview';
  const focusedSectionId = asString(map?.focusedSectionId);
  const viewportInsets = decodeInsets(map?.viewportInsets);
  const floors = asArray(map?.floors)
    .map(decodePickerFloor)
    .filter((entry): entry is SeatLayerPickerFloorInfo => entry !== undefined);
  const seenAccessNeeds = new Set<string>();
  const accessNeeds = asArray(map?.accessNeeds)
    .map(decodeAccessNeed)
    .filter((entry): entry is SeatLayerPickerAccessNeed => entry !== undefined)
    .filter((entry) => {
      if (seenAccessNeeds.has(entry.key)) return false;
      seenAccessNeeds.add(entry.key);
      return true;
    });
  const lineTotal = cartLines.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  const snapshot = {
    schema: seatLayerPickerSnapshotSchema,
    sessionId,
    revision,
    event: {
      key,
      name: asString(event?.name) ?? key,
      mode: asString(event?.mode) ?? 'live',
      currency: asString(event?.currency) ?? 'USD',
      ...optionalStrings(event, ['venue', 'timezone', 'locale', 'posterUrl']),
      ...(asFiniteNumber(event?.startsAt) === undefined
        ? {}
        : { startsAt: asFiniteNumber(event?.startsAt) }),
      salesClosed: asBoolean(event?.salesClosed) ?? false,
    },
    branding: {
      brandName: asString(branding?.brandName),
      logoUrl: asString(branding?.logoUrl),
      attributionRequired: asBoolean(branding?.attributionRequired) ?? true,
      accent: asString(branding?.accent) ?? asString(tokens?.accent),
      accentInk: asString(branding?.accentInk) ?? asString(tokens?.accentInk),
      background: asString(branding?.background) ??
        asString(tokens?.background),
      surface: asString(tokens?.surface),
      text: asString(branding?.textColor) ?? asString(tokens?.text),
      muted: asString(tokens?.muted),
      line: asString(tokens?.line),
      fontFamily: asString(tokens?.fontFamily),
      radius: asFiniteNumber(tokens?.radius),
    },
    categories,
    zones,
    sections,
    generalAdmissionAreas,
    bestAvailableZones,
    map: {
      rung,
      viewMode: asString(map?.viewMode) ?? asString(map?.projection) ?? 'flat',
      buyerView: asString(map?.buyerView) ?? 'map',
      view3DNavigationMode: asString(map?.view3dNavigationMode) ?? 'orbit',
      ...(activeFloorId === undefined ? {} : { activeFloorId }),
      ...(targetSeatId === undefined
        ? {}
        : { view3DTargetSeatId: targetSeatId }),
      ...(targetSeat === undefined
        ? {}
        : { view3DTargetSeat: freeze(targetSeat) }),
      ...(reportsPreviousSeat
        ? { view3DPreviousSeatId: previousSeatId ?? null }
        : {}),
      ...(reportsNextSeat
        ? { view3DNextSeatId: nextSeatId ?? null }
        : {}),
      ...(reportsView3DFocus
        ? { view3DFocusedSectionId: view3DFocusedSectionId ?? null }
        : {}),
      ...optionalStrings(map, [
        'focusedSectionId',
        'floorMode',
        'floorLabelStyle',
      ]),
      ...(focusedSection === undefined ? {} : { focusedSection }),
      colorblindSafe: asBoolean(map?.colorblindSafe) ?? false,
      hideLimitedView: asBoolean(map?.hideLimitedView) ?? false,
      canZoomIn: asBoolean(map?.canZoomIn) ?? true,
      // Older hosted runtimes reported `false` while the buyer was already on
      // the seats rung. Keep the native escape hatch trustworthy during a
      // rolling web/native rollout; the new explicit semantic flag still wins
      // everywhere else.
      canZoomOut: asBoolean(map?.canZoomOut) === true || rung === 'seats' ||
        focusedSectionId !== undefined || focusedSection !== undefined,
      categoryFilter: uniqueStrings(map?.categoryFilter),
      accessibilityFilter: uniqueStrings(map?.accessibilityFilter),
      accessNeeds: freeze(accessNeeds),
      floors,
      ...(viewportInsets === undefined ? {} : { viewportInsets }),
    },
    selection: seats,
    ...(selectionValidity === undefined ? {} : { selectionValidity }),
    maxSelection: asInteger(selection?.maxSelection) ?? 10,
    ticketCount: asInteger(cart?.quantity) ?? seats.length,
    cartLines,
    cartTotal: numberOr(cart?.total, lineTotal),
    currency: asString(cart?.currency) ?? asString(event?.currency) ?? 'USD',
    hold: {
      active: asBoolean(hold?.active) ?? false,
      ...(asFiniteNumber(hold?.expiresAt) === undefined
        ? {}
        : { expiresAt: asFiniteNumber(hold?.expiresAt) }),
      ...(asString(hold?.ownership) === undefined
        ? {}
        : { owner: asString(hold?.ownership) }),
    },
    accessConfigured: asBoolean(access?.configured) ?? false,
    accessStatus: asString(access?.status) ?? 'public',
    ...(asString(access?.reason) === undefined
      ? {}
      : { accessReason: asString(access?.reason) }),
    capabilities: enabledCapabilities(root?.features),
    raw: jsonClone(value),
  };
  return freeze(snapshot) as SeatLayerPickerSnapshot;
}

export function decodeSeatLayerPickerCheckoutHandoff(
  value: unknown,
): SeatLayerPickerCheckoutHandoff | undefined {
  const item = asObject(value);
  const holdId = asString(item?.holdId);
  const expiresAt = asFiniteNumber(item?.expiresAt);
  if (!holdId || expiresAt === undefined) return undefined;
  const lineItems = asArray(item?.lineItems)
    .map(decodeCartLine)
    .filter((entry): entry is SeatLayerPickerCartLine => entry !== undefined);
  return freeze({
    holdId,
    expiresAt,
    currency: asString(item?.currency) ?? lineItems[0]?.currency ?? 'USD',
    lineItems: freeze(lineItems),
    total: numberOr(
      item?.total,
      lineItems.reduce(
        (sum, entry) => sum + entry.unitPrice * entry.quantity,
        0,
      ),
    ),
  });
}

export function decodeSeatLayerSeatView(
  value: unknown,
): SeatLayerSeatView | undefined {
  const item = asObject(value);
  if (!item) return undefined;
  return freeze({
    ...optionalStrings(item, [
      'seatId',
      'title',
      'caption',
      'badge',
      'dragHint',
    ]),
    real: asBoolean(item.real) ?? false,
    generated: asBoolean(item.generated) ?? false,
  });
}
