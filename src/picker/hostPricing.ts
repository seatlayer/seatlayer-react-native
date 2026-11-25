import type { JsonObject } from '../json';

/** The page's word for taking prices from the app: at boot, and while it is open. */
export const seatLayerHostPricingCapability = 'host-pricing-v1';
/** The page's word for being told that the app's server booked the hold. */
export const seatLayerMarkBookedCapability = 'hold-mark-booked-v1';

export const seatLayerSetPricingCommand = 'picker.setPricing';
export const seatLayerMarkBookedCommand = 'picker.markBooked';

/** One price for a category, or a price of its own for each ticket type. */
export type SeatLayerCategoryPricing = number | {
  /** The price without ticket types, and of a type `tiers` leaves out. */
  readonly base?: number;
  /** Price by ticket type id. */
  readonly tiers?: Readonly<Record<string, number>>;
};

/** One price for a seat or table, or one for each ticket type. It has no base. */
export type SeatLayerSeatPricing = number | {
  /** Price by ticket type id. */
  readonly tiers: Readonly<Record<string, number>>;
};

/** The app's own prices, for display. The hold is still priced by the server. */
export interface SeatLayerHostPrices {
  /** Prices by category key. A category left out keeps the chart's price. */
  readonly categories?: Readonly<Record<string, SeatLayerCategoryPricing>>;
  /**
   * Prices of single seats and tables, by their `label`, the booking identity.
   * A seat's own price wins over its category's.
   */
  readonly objects?: Readonly<Record<string, SeatLayerSeatPricing>>;
}

/** The entries an object holds itself; a getter is never called. */
function ownEntries(source: unknown): readonly (readonly [string, unknown])[] {
  try {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return [];
    return Object.entries(Object.getOwnPropertyDescriptors(source)).flatMap(([key, descriptor]) =>
      descriptor.enumerable === true && 'value' in descriptor ? [[key, descriptor.value] as const] : []);
  } catch {
    return [];
  }
}

function price(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function record<T>(entries: readonly (readonly [string, T | undefined])[]): Readonly<Record<string, T>> | undefined {
  const kept = entries.filter((entry): entry is readonly [string, T] => entry[0] !== '' && entry[1] !== undefined);
  return kept.length === 0 ? undefined : Object.freeze(Object.fromEntries(kept));
}

function entry(value: unknown, withBase: boolean): SeatLayerCategoryPricing | undefined {
  const flat = price(value);
  if (flat !== undefined) return flat;
  const own = new Map(ownEntries(value));
  const base = withBase ? price(own.get('base')) : undefined;
  const tiers = record(ownEntries(own.get('tiers')).map(([id, amount]) => [id, price(amount)] as const));
  if (tiers === undefined) return base;
  return Object.freeze({ ...(base === undefined ? {} : { base }), tiers });
}

/** The prices that can be used; anything that is not a price is left out. */
export function resolveSeatLayerHostPrices(input: unknown): SeatLayerHostPrices | undefined {
  const own = new Map(ownEntries(input));
  const categories = record(ownEntries(own.get('categories')).map(([key, value]) =>
    [key, entry(value, true)] as const));
  const objects = record(ownEntries(own.get('objects')).map(([label, value]) =>
    [label, entry(value, false) as SeatLayerSeatPricing | undefined] as const));
  if (categories === undefined && objects === undefined) return undefined;
  return Object.freeze({
    ...(categories === undefined ? {} : { categories }),
    ...(objects === undefined ? {} : { objects }),
  });
}

/** The page's own shape, or null where the app sets no price. */
export function seatLayerHostPricesPayload(input: unknown): JsonObject | null {
  const prices = resolveSeatLayerHostPrices(input);
  if (prices === undefined) return null;
  return {
    ...(prices.categories === undefined ? {} : { prices: prices.categories as unknown as JsonObject }),
    ...(prices.objects === undefined ? {} : { objects: prices.objects as unknown as JsonObject }),
  };
}
