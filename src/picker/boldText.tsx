import type { TextStyle } from 'react-native';

import { seatLayerPickerBoldWeight, useSeatLayerPickerBoldText, type SeatLayerPickerBoldTextStore } from './a11y';
import { seatLayerPickerFontWeight } from './fontWeight';

/**
 * §4.10 — the picker's own answer to the platform's `Bold Text` switch.
 *
 * React Native only thickens text it was left to weight itself. The picker
 * states its weights explicitly — 86 of them, 56 inside module-scope
 * `StyleSheet.create` calls that are evaluated once at import and can never
 * read a hook — so every one of them was drawn exactly as written and the one
 * setting a buyer with low vision reaches for did nothing here at all.
 *
 * The weights are therefore routed through `seatLayerPickerBold` at RENDER
 * time rather than at import time. The setting is a DEVICE setting, one per
 * screen, so it is held in one module-scope cell that the picker's root keeps
 * in step with the platform (`SeatLayerPickerBoldTextRoot`) — which also means
 * a sheet frozen at import can still answer it, through the small proxy below,
 * without any surface having to become a hook.
 *
 * With the setting OFF every one of these returns exactly what it was given —
 * the same numbers, and the very same style objects, not copies.
 */
let boldTextEnabled = false;
let boldGeneration = 0;

/** The live platform setting, as the root last read it. */
export function seatLayerPickerBoldTextEnabled(): boolean {
  return boldTextEnabled;
}

/** Test seam and the root's one writer; answers whether the value moved. */
export function setSeatLayerPickerBoldText(enabled: boolean): boolean {
  if (boldTextEnabled === enabled) return false;
  boldTextEnabled = enabled;
  boldGeneration += 1;
  return true;
}

/**
 * `weight`, heavier where the platform asks for bold text, rounded to a weight
 * React Native can actually paint and clamped at 900.
 */
export function seatLayerPickerBold(weight: number): TextStyle['fontWeight'] {
  return seatLayerPickerFontWeight(seatLayerPickerBoldWeight(weight, boldTextEnabled));
}

/** The same, for a style's own `fontWeight`, in any of the forms RN accepts. */
export function seatLayerPickerBoldFontWeight(
  weight: TextStyle['fontWeight'],
): TextStyle['fontWeight'] {
  if (!boldTextEnabled || weight === undefined || weight === null) return weight;
  if (weight === 'normal') return seatLayerPickerBold(400);
  if (weight === 'bold') return seatLayerPickerBold(700);
  const numeric = typeof weight === 'number' ? weight : Number(weight);
  return Number.isFinite(numeric) ? seatLayerPickerBold(numeric) : weight;
}

/**
 * A picker stylesheet whose text weights answer the setting.
 *
 * `StyleSheet.create` runs at import, long before any platform value is known,
 * so the sheet is read through a proxy instead: a style is handed back exactly
 * as authored while the setting is off, and a bolded copy — built once per
 * change of the setting, not once per render — while it is on. Only entries
 * that actually name a weight are ever copied.
 */
export function seatLayerPickerBoldStyles<T extends Record<string, unknown>>(sheet: T): T {
  let cache: Record<string, unknown> = {};
  let cachedGeneration = -1;
  return new Proxy(sheet, {
    get(target, key: string | symbol) {
      const value = Reflect.get(target, key);
      if (!boldTextEnabled || typeof key !== 'string') return value;
      const weight = (value as TextStyle | undefined)?.fontWeight;
      if (!value || typeof value !== 'object' || weight === undefined || weight === null) return value;
      if (cachedGeneration !== boldGeneration) { cache = {}; cachedGeneration = boldGeneration; }
      cache[key] ??= { ...(value as TextStyle), fontWeight: seatLayerPickerBoldFontWeight(weight) };
      return cache[key];
    },
  }) as T;
}

/**
 * Reads the live platform setting once, at the picker's root, and holds the
 * module cell in step with it — so one subscription serves every line of text
 * instead of each of them asking the platform on its own, and a change of the
 * setting re-renders the whole picker under it.
 */
export function SeatLayerPickerBoldTextRoot(props: Readonly<{
  /** Test seam only; the picker always uses the platform's own store. */
  store?: SeatLayerPickerBoldTextStore;
}>): null {
  setSeatLayerPickerBoldText(useSeatLayerPickerBoldText(props.store));
  return null;
}
