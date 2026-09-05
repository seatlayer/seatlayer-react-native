/**
 * What the picker owes a buyer who is not looking at it (spec §4.10).
 *
 * Three concerns live here, because all three are properties of the picker as
 * a whole rather than of any one surface: the order the surfaces are read in,
 * how far each of them lets the platform grow its type, and the platform's
 * `bold text` setting, which no single component can be trusted to remember.
 *
 * Reduced motion is deliberately NOT here: it has its own accessor in
 * `reducedMotion.ts`, and one setting with two homes is a setting a surface
 * will read from the wrong one.
 */

import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, PixelRatio } from 'react-native';

import { seatLayerPickerTokens } from './tokens.g';

/**
 * The order assistive technology walks the picker in.
 *
 * The compact composition is a column with a stack in the middle, and a
 * stack's paint order is not a reading order: the dock is painted between two
 * halves of the map's own chrome, and the seat card after the toast that
 * answers it. Every surface therefore declares where it sits in one traversal,
 * and the order is the buyer's: whose event this is, what the prices are, the
 * venue, where in it they are, then what they have chosen.
 *
 * The numbers are spaced so a surface can be inserted between two of them
 * without renumbering the rest.
 */
export const seatLayerPickerReadingOrder = Object.freeze({
  /** Whose event this is, the hold, and the way out. */
  header: 100,
  /** The price rail and the Map/3D control that shares its band. */
  rail: 200,
  /** The drawn map itself. */
  map: 300,
  /** Chrome standing on the map: floor rail, test chip, corner controls. */
  mapChrome: 400,
  /** Where in the venue the buyer is (host opt-in; the default phone has none). */
  dock: 500,
  /** The seat card and the general-admission and table prompts. */
  prompt: 600,
  /** Toasts, hold prompts and the buyer-facing state overlays. */
  notice: 700,
  /** The cart, at peek or open. */
  sheet: 800,
} as const);

export type SeatLayerPickerReadingRung = keyof typeof seatLayerPickerReadingOrder;

/**
 * React Native has no per-node sort key. The order is declared once, at the
 * composition root, as the list of `nativeID`s the root walks in — the same
 * shape as `UIAccessibilityElement` ordering on iOS and `traversalIndex` on
 * Compose, and the reason each surface only needs a stable id rather than a
 * rung of its own.
 */
export const seatLayerPickerReadingOrderIds: Readonly<Record<SeatLayerPickerReadingRung, string>> = Object.freeze({
  header: 'seatlayer-order-header',
  rail: 'seatlayer-order-rail',
  map: 'seatlayer-order-map',
  mapChrome: 'seatlayer-order-map-chrome',
  dock: 'seatlayer-order-dock',
  prompt: 'seatlayer-order-prompt',
  notice: 'seatlayer-order-notice',
  sheet: 'seatlayer-order-sheet',
});

const rungs: readonly SeatLayerPickerReadingRung[] = Object.freeze(
  (Object.keys(seatLayerPickerReadingOrder) as SeatLayerPickerReadingRung[])
    .sort((left, right) => seatLayerPickerReadingOrder[left] - seatLayerPickerReadingOrder[right]),
);

/**
 * The ids the composition root declares, in buyer order.
 *
 * Sibling surfaces are either ALL ordered or none are: a group with some
 * ordered members falls back to geometry for the rest, which is how the map
 * came to be read before the prices. So this takes the surfaces that are
 * actually mounted and returns every one of them — never a subset.
 */
export function seatLayerPickerReadingOrderFor(
  mounted: Partial<Readonly<Record<SeatLayerPickerReadingRung, boolean>>>,
): readonly string[] {
  return Object.freeze(rungs
    .filter((rung) => mounted[rung] === true)
    .map((rung) => seatLayerPickerReadingOrderIds[rung]));
}

/** The rungs, ascending — the order a port's own traversal must reproduce. */
export const seatLayerPickerReadingRungs = rungs;

export type SeatLayerPickerTypeScaleSurface = Exclude<keyof typeof seatLayerPickerTokens.type.scaleClamp, 'note'>;

/**
 * How far a surface lets the platform's text-size setting grow its type.
 *
 * A clamp is a statement about a layout, not a preference: past it the surface
 * clips, and a buyer who cannot read a clipped price is worse off than one
 * reading a slightly smaller one. Prompts and dialogs are deliberately absent
 * from the token: they own the screen, scroll, and are never clamped.
 */
export function seatLayerPickerTypeScaleClamp(surface: SeatLayerPickerTypeScaleSurface): number {
  return seatLayerPickerTokens.type.scaleClamp[surface];
}

/**
 * How far the type in a surface has actually grown, once its clamp has had its
 * say.
 *
 * Never below 1: a buyer who has made their text SMALLER is not asking for a
 * shorter dock bar, and a bar that shrank with the type would leave its
 * 44-point controls without room.
 */
export function seatLayerPickerClampedFontScale(max: number, scale = readFontScale()): number {
  if (!Number.isFinite(max) || max <= 1) return 1;
  if (!Number.isFinite(scale) || scale <= 1) return 1;
  return scale > max ? max : scale;
}

/**
 * `base` grown by the surface's clamped text scale.
 *
 * The fixed heights in `tokens.json` are heights for type at 1.0. Left fixed
 * they become ceilings the moment a buyer scales their text up, and a bar whose
 * contents are taller than the bar clips. Used as the drawn height AND as the
 * height reported to the runtime, because the reported band and the drawn band
 * have to be the same number (§2.3).
 *
 * At the platform default of 1.0 this returns `base` unchanged, which is what
 * keeps the fixtures still.
 */
export function seatLayerPickerScaledExtent(
  base: number,
  max: number,
  scale = readFontScale(),
): number {
  if (!Number.isFinite(base) || base <= 0) return base;
  return base * seatLayerPickerClampedFontScale(max, scale);
}

function readFontScale(): number {
  try {
    const scale = PixelRatio.getFontScale();
    return typeof scale === 'number' && Number.isFinite(scale) ? scale : 1;
  } catch {
    return 1;
  }
}

/** The platform's current text scale, floored at 1 and clamped per surface. */
export function useSeatLayerPickerScaledExtent(base: number, max: number): number {
  return seatLayerPickerScaledExtent(base, max);
}

/**
 * How much heavier `bold text` makes the picker's type.
 *
 * Two steps, not one: the picker's own scale already runs 600–800, and a
 * single step inside it is a change nobody can see.
 */
export const seatLayerPickerBoldTextStep = 200;

/**
 * `weight`, heavier, where the platform asks for bold text.
 *
 * React Native draws `fontWeight` itself and does not move an explicit weight
 * when iOS `Bold Text` is on — only text left at the system weight is affected
 * — so every explicit weight in the picker has to ask, exactly as Flutter does.
 */
export function seatLayerPickerBoldWeight(weight: number, boldText: boolean): number {
  if (!boldText || !Number.isFinite(weight)) return weight;
  const target = Math.round(weight) + seatLayerPickerBoldTextStep;
  return target > 900 ? 900 : target;
}

export interface SeatLayerPickerBoldTextSubscription { remove(): void; }
export interface SeatLayerPickerBoldTextSource {
  isBoldTextEnabled(): Promise<boolean>;
  addEventListener(
    event: 'boldTextChanged',
    listener: (enabled: boolean) => void,
  ): SeatLayerPickerBoldTextSubscription;
}

/** Live accessibility store: each active subscription refreshes and listens anew. */
export class SeatLayerPickerBoldTextStore {
  private value = false;
  private readonly listeners = new Set<() => void>();
  private subscription: SeatLayerPickerBoldTextSubscription | undefined;
  private generation = 0;
  constructor(private readonly source: SeatLayerPickerBoldTextSource) {}
  getSnapshot = (): boolean => this.value;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };
  private start(): void {
    const generation = ++this.generation;
    const apply = (enabled: unknown) => {
      if (typeof enabled !== 'boolean' || generation !== this.generation ||
        this.listeners.size === 0 || this.value === enabled) return;
      this.value = enabled;
      for (const listener of [...this.listeners]) listener();
    };
    try {
      this.subscription = this.source.addEventListener('boldTextChanged', apply);
    } catch { /* Optional RN event surface. */ }
    try {
      void this.source.isBoldTextEnabled().then(apply, () => {});
    } catch { /* Accessibility detection remains safely false. */ }
  }
  private stop(): void {
    this.generation += 1;
    try { this.subscription?.remove(); } catch { /* Best-effort native cleanup. */ }
    this.subscription = undefined;
  }
}

const boldTextStore = new SeatLayerPickerBoldTextStore(AccessibilityInfo as unknown as SeatLayerPickerBoldTextSource);

export function useSeatLayerPickerBoldText(
  store: SeatLayerPickerBoldTextStore = boldTextStore,
): boolean {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * Say `message` out loud, once.
 *
 * For the moments a live region cannot carry: a message that arrives and
 * leaves inside one animation, or one whose surface is unmounted by the time
 * the platform would have got round to reading it.
 */
export function seatLayerPickerAnnounce(message: unknown): void {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text.length === 0) return;
  try { AccessibilityInfo.announceForAccessibility?.(text); } catch { /* advisory */ }
}
