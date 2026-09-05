import React, { useSyncExternalStore } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { seatLayerPickerColorAlpha } from './colors';
import { seatLayerPickerTokens } from './tokens.g';

/**
 * §3.8.1 / §3.8.2 — the map goes behind glass with a hole in it.
 *
 * While a seat card is up the map takes a veil at `opacity.confirmScrim`
 * behind a `size.confirmScrimBlur` blur, cleared to
 * `size.confirmScrimClearRadius` around the tapped seat and reaching full
 * strength at `size.confirmScrimFeatherRadius`. The hole is what makes this a
 * spotlight rather than a curtain: the buyer is being asked about one seat and
 * can still see it. The feather is what stops the hole reading as a drawn
 * circle.
 *
 * Three rules bind it: it is only drawn where there is a seat to spotlight, it
 * never takes a pointer event, and reduced transparency drops the blur and
 * deepens the veil to `opacity.confirmScrimFlat`.
 */

/** How many rings the feather is drawn with; 32 px of feather over 8 steps. */
const featherRings = 8;

/**
 * The four veil rectangles leave a SQUARE clear, and the feather covers a
 * DISC. Without this the square's four corners were unveiled — a hard-edged
 * light patch around the seat, measured on device 2026-09-05. One more ring at
 * full veil, out to the square's own corner distance, closes them.
 */
const cornerFill = Math.SQRT2;

export interface SeatLayerPickerSpotlightPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A blur surface the host has installed.
 *
 * React Native has no blur of its own, and `@react-native-community/blur` is a
 * native module the SDK must not hard-depend on: a bundler resolves a
 * `require` statically, so an app without the module could not build. A host
 * that has it installs it here and the glass gains its blur; without it the
 * glass is the plain veil, which is a correct state and not a degraded one.
 */
export type SeatLayerPickerSpotlightBlurComponent = React.ComponentType<{
  readonly blurAmount: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly pointerEvents?: 'none';
}>;

let installedBlur: SeatLayerPickerSpotlightBlurComponent | undefined;

/** Installs (or clears, with `undefined`) the blur the spotlight draws behind. */
export function setSeatLayerPickerSpotlightBlur(
  component: SeatLayerPickerSpotlightBlurComponent | undefined,
): void {
  installedBlur = component;
}

/** What the glass would draw behind, if anything. */
export function seatLayerPickerSpotlightBlur(): SeatLayerPickerSpotlightBlurComponent | undefined {
  return installedBlur;
}

export interface SpotlightGlassProps {
  /** Only with a seat to spotlight: a prompt about no one seat draws nothing. */
  readonly visible: boolean;
  /**
   * Where the seat is, in the map surface's own pixels. Absent on a runtime
   * without `seat-screen-point-v1`: the card then stands over flat glass.
   */
  readonly screenPoint?: SeatLayerPickerSpotlightPoint;
  /** Overrides the platform reading; the store is used when this is absent. */
  readonly reducedTransparency?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/** One layer of the glass, ready to draw; exported so a test can read it. */
export interface SeatLayerPickerSpotlightLayer {
  readonly key: string;
  readonly opacity: number;
  readonly rect?: Readonly<{ top?: number; bottom?: number; left?: number; right?: number; width?: number; height?: number }>;
  readonly ring?: Readonly<{ size: number; radius: number; border: number; top: number; left: number }>;
}

/**
 * The veil, as the four rectangles outside the feather plus the rings that
 * ramp it in.
 *
 * React Native has no radial gradient, so the ramp is drawn as concentric
 * rings — a view with a border and a full corner radius IS a ring — each at
 * the veil strength its own radius calls for.
 */
export function seatLayerPickerSpotlightLayers(
  point: SeatLayerPickerSpotlightPoint | undefined,
  veil: number,
): readonly SeatLayerPickerSpotlightLayer[] {
  const clear = seatLayerPickerTokens.size.confirmScrimClearRadius;
  const feather = seatLayerPickerTokens.size.confirmScrimFeatherRadius;
  if (point === undefined || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !(feather > clear)) {
    return Object.freeze([Object.freeze({ key: 'flat', opacity: veil, rect: Object.freeze({ top: 0, bottom: 0, left: 0, right: 0 }) })]);
  }
  const step = (feather - clear) / featherRings;
  const layers: SeatLayerPickerSpotlightLayer[] = [
    { key: 'above', opacity: veil, rect: Object.freeze({ top: 0, left: 0, right: 0, height: Math.max(0, point.y - feather) }) },
    { key: 'below', opacity: veil, rect: Object.freeze({ bottom: 0, left: 0, right: 0, top: point.y + feather }) },
    { key: 'leading', opacity: veil, rect: Object.freeze({ top: Math.max(0, point.y - feather), left: 0, width: Math.max(0, point.x - feather), height: feather * 2 }) },
    { key: 'trailing', opacity: veil, rect: Object.freeze({ top: Math.max(0, point.y - feather), left: point.x + feather, right: 0, height: feather * 2 }) },
  ].map((layer) => Object.freeze(layer));
  for (let index = 0; index < featherRings; index += 1) {
    const inner = clear + index * step;
    const outer = inner + step;
    // The ring's own strength is where the middle of it sits on the ramp:
    // nothing at the clear radius, the whole veil at the feather radius.
    const ramp = (inner + step / 2 - clear) / (feather - clear);
    layers.push(Object.freeze({
      key: `ring-${index}`,
      opacity: veil * ramp,
      ring: Object.freeze({ size: outer * 2, radius: outer, border: step, top: point.y - outer, left: point.x - outer }),
    }));
  }
  const corner = feather * cornerFill;
  layers.push(Object.freeze({
    key: 'ring-corner',
    opacity: veil,
    ring: Object.freeze({
      size: corner * 2, radius: corner, border: corner - feather,
      top: point.y - corner, left: point.x - corner,
    }),
  }));
  return Object.freeze(layers);
}

/** The veil strength: deeper, and with no blur behind it, under reduced transparency. */
export function seatLayerPickerSpotlightVeil(reducedTransparency: boolean): number {
  return reducedTransparency
    ? seatLayerPickerTokens.opacity.confirmScrimFlat
    : seatLayerPickerTokens.opacity.confirmScrim;
}

/** The map's glass while one seat card is up. Never takes a pointer event. */
export function SpotlightGlass(props: SpotlightGlassProps): React.ReactElement | null {
  const platform = useSeatLayerPickerReducedTransparency();
  if (!props.visible) return null;
  const flat = props.reducedTransparency ?? platform;
  const veil = seatLayerPickerSpotlightVeil(flat);
  const Blur = flat ? undefined : installedBlur;
  return <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
    style={[StyleSheet.absoluteFill, props.style]}
    testID="seatLayerSpotlightGlass"
  >
    {Blur === undefined ? null : <Blur blurAmount={seatLayerPickerTokens.size.confirmScrimBlur} pointerEvents="none" style={StyleSheet.absoluteFill} />}
    {seatLayerPickerSpotlightLayers(props.screenPoint, veil).map((layer) => layer.ring
      ? <View
        key={layer.key}
        pointerEvents="none"
        style={{
          borderColor: seatLayerPickerColorAlpha('#000000', layer.opacity),
          borderRadius: layer.ring.radius,
          borderWidth: layer.ring.border,
          height: layer.ring.size,
          left: layer.ring.left,
          position: 'absolute',
          top: layer.ring.top,
          width: layer.ring.size,
        }}
      />
      : <View
        key={layer.key}
        pointerEvents="none"
        style={{ backgroundColor: seatLayerPickerColorAlpha('#000000', layer.opacity), position: 'absolute', ...layer.rect }}
      />)}
  </View>;
}

interface ReducedTransparencySource {
  isReduceTransparencyEnabled?: () => Promise<boolean>;
  addEventListener(
    event: 'reduceTransparencyChanged',
    listener: (enabled: boolean) => void,
  ): { remove(): void };
}

/**
 * Live reduced-transparency store, mirroring the reduced-motion one: each
 * active subscription refreshes and listens anew, and a platform with no
 * reading of its own stays safely false.
 */
export class SeatLayerPickerReducedTransparencyStore {
  private value = false;
  private readonly listeners = new Set<() => void>();
  private subscription: { remove(): void } | undefined;
  private generation = 0;
  constructor(private readonly source: ReducedTransparencySource) {}
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
      if (typeof enabled !== 'boolean' || generation !== this.generation || this.listeners.size === 0 || this.value === enabled) return;
      this.value = enabled;
      for (const listener of this.listeners) listener();
    };
    try {
      this.subscription = this.source.addEventListener('reduceTransparencyChanged', apply);
    } catch { /* Optional native event surface. */ }
    try {
      void this.source.isReduceTransparencyEnabled?.().then(apply, () => {});
    } catch { /* Legibility detection remains safely false. */ }
  }
  private stop(): void {
    this.generation += 1;
    try { this.subscription?.remove(); } catch { /* Best-effort native cleanup. */ }
    this.subscription = undefined;
  }
}

const reducedTransparencyStore = new SeatLayerPickerReducedTransparencyStore(
  AccessibilityInfo as unknown as ReducedTransparencySource,
);

export function useSeatLayerPickerReducedTransparency(
  store: SeatLayerPickerReducedTransparencyStore = reducedTransparencyStore,
): boolean {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
