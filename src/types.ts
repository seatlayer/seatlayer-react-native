import type { JsonObject, JsonValue } from './json';

export const seatLayerSdkVersion = '0.1.2';
export const seatLayerBundledWebVersion = '0.30.1';

export interface ProtocolRange {
  min: number;
  max: number;
}

export interface SeatLayerConfiguration {
  /** SeatLayer event key, for example `ev_...`. */
  event: string;
  /** API origin. Defaults to `https://api.seatlayer.io` in the bundle. */
  apiBase?: string;
  /** Reserved for future authenticated rendering. Never pass a secret key. */
  publicKey?: string;
  maxSelection?: number;
  /** BCP 47 UI locale. Built-in bundles currently include en, es, de and fr. */
  locale?: string;
  messages?: Record<string, string>;
  /** ISO 4217 display currency. */
  currency?: string;
  colorblindSafe?: boolean;
  /** Leave false when the app renders its own touch-friendly seat sheet. */
  showsWebSeatTooltip?: boolean;
  /** Native command deadline. Defaults to 15 seconds. */
  commandTimeoutMs?: number;
  /** Handshake deadline. Defaults to 30 seconds. */
  handshakeTimeoutMs?: number;
  /** Free-form, non-secret host diagnostics. */
  hostInfo?: Record<string, string>;
}

export interface BundleInfo {
  protocol: ProtocolRange;
  version?: string;
  platform?: string;
  commands: string[];
  events: string[];
  raw: JsonValue | undefined;
}

export interface ReadyInfo {
  protocolRevision: number;
  mode?: string;
  platform?: string;
  eventKey?: string;
  raw: JsonValue | undefined;
}

export interface CategoryTier {
  id: string;
  name: string;
  price: number;
}

export interface SeatCommercialAttributes {
  restrictedView?: boolean;
  obstructedView?: boolean;
  premium?: boolean;
  note?: string;
}

export interface SelectedSeat {
  id: string;
  /** Stable inventory identity. Use this for booking. */
  label: string;
  /** Buyer-facing label. Do not use as inventory identity. */
  displayLabel?: string;
  categoryKey?: string;
  price?: number;
  tiers?: CategoryTier[];
  tierId?: string;
  commercial?: SeatCommercialAttributes;
}

export interface HoldLineItem {
  label: string;
  objectId?: string;
  objectType?: string;
  categoryKey?: string;
  tierId?: string;
  unitPrice?: number;
  currency?: string;
  quantity?: number;
}

export interface HoldResult {
  holdId: string;
  /** Milliseconds since Unix epoch. */
  expiresAt: number;
  seats?: SelectedSeat[];
  items?: HoldLineItem[];
}

export interface BestAvailableResult extends HoldResult {
  labels: string[];
}

export interface GAArea {
  id: string;
  label?: string;
  capacity?: number;
  available?: number;
  categoryKey?: string;
  price?: number;
  currency?: string;
  tiers?: CategoryTier[];
}

export interface FloorInfo {
  id: string;
  label?: string;
  level?: number;
}

export interface SeatHoverDetails {
  seatId?: string;
  label?: string;
  displayLabel?: string;
  categoryKey?: string;
  price?: number;
  status?: string;
}

export interface HoldConflict {
  label?: string;
  status?: string;
}

export interface BridgeErrorDetails {
  code: string;
  message: string;
  retryable?: boolean;
  conflicts?: HoldConflict[];
  meta?: JsonObject;
}

export interface UnknownEvent {
  name: string;
  payload: JsonValue | undefined;
}

export interface SeatLayerEventMap {
  ready: ReadyInfo;
  selectionChanged: SelectedSeat[];
  holdChanged: HoldResult;
  holdRestored: HoldResult;
  holdExpired: undefined;
  checkout: JsonValue | undefined;
  error: import('./errors').SeatLayerError;
  hint: string | undefined;
  gaClick: GAArea;
  seatHover: SeatHoverDetails | undefined;
  deckTap: string;
  unknownEvent: UnknownEvent;
}
