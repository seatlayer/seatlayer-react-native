import { seatLayerPickerTokens } from './tokens.g';
import type { SeatLayerPickerMoneyFormatter } from './format';

export type { SeatLayerPickerMoneyFormatter } from './format';

export type SeatLayerPickerLayoutMode = 'adaptive' | 'phone' | 'wide' | (string & {});
export type SeatLayerPickerResolvedLayoutMode = 'phone' | 'wide';
type SeatLayerPickerKnownLayoutMode = 'adaptive' | SeatLayerPickerResolvedLayoutMode;

/** Native-chrome money presentation. Runtime inventory and totals remain authoritative. */
export interface SeatLayerPickerPricing {
  readonly formatter?: SeatLayerPickerMoneyFormatter;
}

/** Visibility choices for the ready-made composition only. */
export interface SeatLayerPickerChromeOptions {
  readonly header?: boolean;
  readonly priceLegend?: boolean;
  /** Wide-layout floor navigation ownership point. */
  readonly floorSelector?: boolean;
  /** Compact floor strip ownership point. */
  readonly floorStrip?: boolean;
  readonly mapControls?: boolean;
  /** Auto: wide only. */
  readonly overview?: boolean | null;
  /** Auto: wide only. */
  readonly zoom?: boolean | null;
  /** Auto: wide only. */
  readonly colorblind?: boolean | null;
  readonly fit?: boolean;
  readonly map3D?: boolean;
  readonly accessibility?: boolean;
  readonly cartSheet?: boolean;
  /**
   * Auto: wide only. There is no phone form of the section dock (§3.6, owner
   * call 2026-09-04) — the pinch and the single `−` control walk a buyer back
   * to the venue — but a host that asks for it explicitly gets it.
   */
  readonly dock?: boolean | null;
  /**
   * Auto: off on the phone, on in the wide layout (§3.13.8). The phone gives
   * the buyer ONE timer, the header's countdown; a card arriving over the map
   * inside the last minute is a second decision at the worst moment.
   *
   * RESERVED. No prompt is drawn on any layout yet — the option is resolved
   * and carried so a host that sets it does not have to change when the wide
   * prompt lands, and so the phone's answer (never) is already written down.
   */
  readonly showExtendHoldPrompt?: boolean | null;
  readonly confirmCard?: boolean;
  readonly venue3D?: boolean;
  readonly seatViewChrome?: boolean;
  readonly holdPill?: boolean;
  readonly systemBars?: boolean;
}

/** Session behaviour owned by the ready-made picker. */
export interface SeatLayerPickerBehaviorOptions {
  readonly readOnly?: boolean;
  readonly confirmSelection?: boolean;
  readonly enableBestAvailable?: boolean;
  readonly enable3D?: boolean;
  readonly enableSeatView?: boolean;
  readonly holdTtlMs?: number;
  readonly initialHoldId?: string;
  readonly max3DSeats?: number;
  readonly hideEventDetails?: boolean;
  readonly panelInitiallyCollapsed?: boolean;
  readonly persistColorblindPreference?: boolean;
  readonly refreshOnResume?: boolean;
  readonly announceHoldLapse?: boolean;
  /**
   * "You're all set" is the SDK's to tell by default (= web). A host with its
   * own confirmation screen sets it false; the sale is still known through
   * `onBooked`, only the telling is the host's (§3.13).
   */
  readonly showBookedOverlay?: boolean;
  /**
   * The event's name before the runtime reports one, so the header does not
   * swap its title a second after opening (§4.7). It is never sent to the
   * runtime: the runtime's own name wins the moment it arrives.
   */
  readonly eventName?: string;
  readonly haptics?: boolean;
  /**
   * The header's hold countdown (§3.1). It is drawn for as long as a live hold
   * exists, whoever owns it — a host that draws its own clock sets this false
   * so the buyer is not given two. Composes with `chrome.holdPill`: the pill is
   * drawn only where BOTH are on.
   */
  readonly showHoldPill?: boolean;
}

/** Typed options for the ready-made layout; themes, styles, wording and configuration stay top-level. */
export interface SeatLayerPickerOptions extends SeatLayerPickerBehaviorOptions {
  readonly layout?: SeatLayerPickerLayoutMode;
  readonly chrome?: SeatLayerPickerChromeOptions;
  /** BCP 47 language tags offered by the runtime language control. */
  readonly languages?: readonly string[];
  /** Global money formatting for native chrome; runtime amounts remain authoritative. */
  readonly pricing?: SeatLayerPickerPricing;
}

export interface SeatLayerPickerResolvedChromeOptions {
  readonly header: boolean;
  readonly priceLegend: boolean;
  readonly floorSelector: boolean;
  readonly floorStrip: boolean;
  readonly mapControls: boolean;
  readonly overview: boolean;
  readonly zoom: boolean;
  readonly colorblind: boolean;
  readonly fit: boolean;
  readonly map3D: boolean;
  readonly accessibility: boolean;
  readonly cartSheet: boolean;
  readonly dock: boolean;
  readonly showExtendHoldPrompt: boolean;
  readonly confirmCard: boolean;
  readonly venue3D: boolean;
  readonly seatViewChrome: boolean;
  readonly holdPill: boolean;
  readonly systemBars: boolean;
}

export interface SeatLayerPickerResolvedOptions {
  readonly layout: SeatLayerPickerKnownLayoutMode;
  readonly resolvedLayout: SeatLayerPickerResolvedLayoutMode;
  readonly chrome: SeatLayerPickerResolvedChromeOptions;
  readonly readOnly: boolean;
  readonly confirmSelection: boolean;
  readonly enableBestAvailable: boolean;
  readonly enable3D: boolean;
  readonly enableSeatView: boolean;
  readonly holdTtlMs?: number;
  readonly initialHoldId?: string;
  readonly max3DSeats?: number;
  readonly hideEventDetails: boolean;
  readonly panelInitiallyCollapsed: boolean;
  readonly persistColorblindPreference: boolean;
  readonly refreshOnResume: boolean;
  readonly showHoldPill: boolean;
  readonly announceHoldLapse: boolean;
  readonly showBookedOverlay: boolean;
  readonly eventName?: string;
  readonly haptics: boolean;
  readonly languages: readonly string[];
  readonly pricing?: SeatLayerPickerPricing;
}

/** Runtime-owned boot projection, distinct from the controller handshake wrapper. */
export type SeatLayerPickerRuntimeConfig = Readonly<{
  readonly holdTtlMs?: number;
  readonly initialHoldId?: string;
  readonly readOnly: boolean;
  readonly confirmSelection: boolean;
  readonly enableBestAvailable: boolean;
  readonly enable3D: boolean;
  readonly enableSeatView: boolean;
  readonly max3DSeats?: number;
  readonly hideEventDetails: boolean;
  readonly panelCollapsed: boolean;
  readonly languages?: string[];
}>;

function ownData(source: unknown, key: string): unknown {
  try {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function autoBoolean(value: unknown, phone: boolean): boolean {
  return typeof value === 'boolean' ? value : !phone;
}

function validDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function validSeatLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function validEventName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim();
  return name && name.length <= 200 ? name : undefined;
}

function validInitialHold(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function safeOwnStrings(value: unknown, maximum = 64): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  try {
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > maximum) {
      return Object.freeze([]);
    }
    const output: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      const entry = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      if (typeof entry !== 'string') continue;
      const normalized = entry.trim();
      const key = normalized.toLocaleLowerCase();
      if (!normalized || normalized.length > 128 || seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
    }
    return Object.freeze(output);
  } catch {
    return Object.freeze([]);
  }
}

/** Snapshots a safe own-data formatter without allowing accessors into render paths. */
export function resolveSeatLayerPickerPricing(input: SeatLayerPickerPricing | unknown): SeatLayerPickerPricing | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const formatter = ownData(input, 'formatter');
  return typeof formatter === 'function'
    ? Object.freeze({ formatter: formatter as SeatLayerPickerMoneyFormatter })
    : undefined;
}

function knownLayout(value: unknown): SeatLayerPickerKnownLayoutMode {
  return value === 'phone' || value === 'wide' || value === 'adaptive' ? value : 'adaptive';
}

/** Resolves an explicit layout, otherwise the generated wide threshold. */
export function resolveSeatLayerPickerLayoutMode(
  mode: SeatLayerPickerLayoutMode | unknown = 'adaptive',
  width?: number,
): SeatLayerPickerResolvedLayoutMode {
  const requested = knownLayout(mode);
  if (requested === 'phone' || requested === 'wide') return requested;
  if (typeof width !== 'number' || !Number.isFinite(width) || width < 0) return 'phone';
  if (width < seatLayerPickerTokens.size.phoneBreakpoint) return 'phone';
  return width >= seatLayerPickerTokens.size.wideBreakpoint ? 'wide' : 'phone';
}

/** Resolves only supported modes; unknown future strings remain safely adaptive. */
export function resolveSeatLayerPickerChromeOptions(
  input: SeatLayerPickerChromeOptions | unknown = {},
  layout: SeatLayerPickerResolvedLayoutMode = 'phone',
): SeatLayerPickerResolvedChromeOptions {
  const phone = layout === 'phone';
  return Object.freeze({
    header: booleanOr(ownData(input, 'header'), true),
    priceLegend: booleanOr(ownData(input, 'priceLegend'), true),
    floorSelector: booleanOr(ownData(input, 'floorSelector'), true),
    floorStrip: booleanOr(ownData(input, 'floorStrip'), true),
    mapControls: booleanOr(ownData(input, 'mapControls'), true),
    overview: autoBoolean(ownData(input, 'overview'), phone),
    zoom: autoBoolean(ownData(input, 'zoom'), phone),
    colorblind: autoBoolean(ownData(input, 'colorblind'), phone),
    fit: booleanOr(ownData(input, 'fit'), true),
    map3D: booleanOr(ownData(input, 'map3D'), true),
    accessibility: booleanOr(ownData(input, 'accessibility'), true),
    cartSheet: booleanOr(ownData(input, 'cartSheet'), true),
    dock: autoBoolean(ownData(input, 'dock'), phone),
    showExtendHoldPrompt: autoBoolean(ownData(input, 'showExtendHoldPrompt'), phone),
    confirmCard: booleanOr(ownData(input, 'confirmCard'), true),
    venue3D: booleanOr(ownData(input, 'venue3D'), true),
    seatViewChrome: booleanOr(ownData(input, 'seatViewChrome'), true),
    holdPill: booleanOr(ownData(input, 'holdPill'), true),
    systemBars: booleanOr(ownData(input, 'systemBars'), true),
  });
}

/** Normalizes untrusted options into a frozen, ready-made composition contract. */
export function resolveSeatLayerPickerOptions(
  input: SeatLayerPickerOptions | unknown = {},
  width?: number,
): SeatLayerPickerResolvedOptions {
  const layout = knownLayout(ownData(input, 'layout'));
  const resolvedLayout = resolveSeatLayerPickerLayoutMode(layout, width);
  const chrome = resolveSeatLayerPickerChromeOptions(ownData(input, 'chrome'), resolvedLayout);
  const resolved = {
    layout,
    resolvedLayout,
    chrome,
    readOnly: booleanOr(ownData(input, 'readOnly'), false),
    confirmSelection: booleanOr(ownData(input, 'confirmSelection'), true),
    enableBestAvailable: booleanOr(ownData(input, 'enableBestAvailable'), true),
    enable3D: booleanOr(ownData(input, 'enable3D'), true),
    enableSeatView: booleanOr(ownData(input, 'enableSeatView'), true),
    holdTtlMs: validDuration(ownData(input, 'holdTtlMs')),
    initialHoldId: validInitialHold(ownData(input, 'initialHoldId')),
    max3DSeats: validSeatLimit(ownData(input, 'max3DSeats')),
    hideEventDetails: booleanOr(ownData(input, 'hideEventDetails'), false),
    panelInitiallyCollapsed: booleanOr(ownData(input, 'panelInitiallyCollapsed'), true),
    persistColorblindPreference: booleanOr(ownData(input, 'persistColorblindPreference'), true),
    refreshOnResume: booleanOr(ownData(input, 'refreshOnResume'), true),
    showHoldPill: booleanOr(ownData(input, 'showHoldPill'), true),
    announceHoldLapse: booleanOr(ownData(input, 'announceHoldLapse'), true),
    showBookedOverlay: booleanOr(ownData(input, 'showBookedOverlay'), true),
    eventName: validEventName(ownData(input, 'eventName')),
    haptics: booleanOr(ownData(input, 'haptics'), true),
    languages: safeOwnStrings(ownData(input, 'languages')),
    pricing: resolveSeatLayerPickerPricing(ownData(input, 'pricing')),
  } satisfies SeatLayerPickerResolvedOptions;
  return Object.freeze(resolved);
}

/** The runtime receives only boot-owned fields, never native composition preferences. */
export function seatLayerPickerBridgeConfigFromOptions(
  options: SeatLayerPickerResolvedOptions | SeatLayerPickerOptions | unknown,
): SeatLayerPickerRuntimeConfig {
  const resolved = resolveSeatLayerPickerOptions(options);
  return Object.freeze({
    ...(resolved.holdTtlMs === undefined ? {} : { holdTtlMs: resolved.holdTtlMs }),
    ...(resolved.initialHoldId === undefined ? {} : { initialHoldId: resolved.initialHoldId }),
    readOnly: resolved.readOnly,
    confirmSelection: resolved.confirmSelection,
    enableBestAvailable: resolved.enableBestAvailable,
    enable3D: resolved.enable3D,
    enableSeatView: resolved.enableSeatView,
    ...(resolved.max3DSeats === undefined ? {} : { max3DSeats: resolved.max3DSeats }),
    hideEventDetails: resolved.hideEventDetails,
    panelCollapsed: resolved.panelInitiallyCollapsed,
    ...(resolved.languages.length === 0 ? {} : { languages: [...resolved.languages] }),
  });
}
