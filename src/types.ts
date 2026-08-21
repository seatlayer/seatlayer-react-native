import type { JsonObject, JsonValue } from './json';

export const seatLayerSdkVersion = '0.2.0';
export const seatLayerHostedWebVersion = '0.66.0';
/** @deprecated Production uses the hosted runtime; use seatLayerHostedWebVersion. */
export const seatLayerBundledWebVersion = seatLayerHostedWebVersion;
export const seatLayerMobileOrigin = 'https://cdn.seatlayer.io';
export const seatLayerMobilePageUrl = `${seatLayerMobileOrigin}/seatlayer-js@${seatLayerHostedWebVersion}/mobile.html`;

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
  /** Opaque buyer session minted by your backend for https://cdn.seatlayer.io. */
  buyerAccessToken?: BuyerAccessToken;
  /** Called only over the native bridge; its token is never put in a URL or event. */
  buyerAccessTokenProvider?: BuyerAccessTokenProvider;
  maxSelection?: number;
  selectedObjects?: string[];
  selectableObjects?: string[] | null;
  numberOfPlacesToSelect?: number;
  selectionValidators?: SelectionValidator[];
  /** BCP 47 UI locale. Built-in bundles currently include en, es, de and fr. */
  locale?: string;
  messages?: Record<string, string>;
  /** ISO 4217 display currency. */
  currency?: string;
  colorblindSafe?: boolean;
  initialView?: SeatLayerViewMode;
  /** Leave false when the app renders its own touch-friendly seat sheet. */
  showsWebSeatTooltip?: boolean;
  /** Native command deadline. Defaults to 15 seconds. */
  commandTimeoutMs?: number;
  /** Handshake deadline. Defaults to 30 seconds. */
  handshakeTimeoutMs?: number;
  /** Free-form, non-secret host diagnostics. */
  hostInfo?: Record<string, string>;
}

export type BuyerAccessRefreshReason =
  | 'initial'
  | 'expiring'
  | 'expired'
  | 'unauthorized'
  | 'reconnect'
  | 'manual'
  | (string & {});

export interface BuyerAccessToken {
  token: string;
  /** Epoch milliseconds. Omit to refresh reactively. */
  expiresAt?: number;
}

export type BuyerAccessTokenProvider = (context: {
  reason: BuyerAccessRefreshReason;
}) => Promise<BuyerAccessToken> | BuyerAccessToken;

export type BuyerAccessUnavailableReason =
  | 'revoked'
  | 'paused'
  | 'invalid'
  | 'origin_mismatch'
  | 'event_mismatch'
  | 'group_mismatch'
  | 'mode_mismatch'
  | 'channel_denied'
  | 'invalid_scope'
  | 'provider_failed'
  | 'no_token'
  | (string & {});

export interface BuyerAccessExpiredEvent {
  reason: BuyerAccessRefreshReason;
  code?: string;
  refreshed: boolean;
}

export interface BuyerAccessUnavailableEvent {
  reason: BuyerAccessUnavailableReason;
  code?: string;
  status?: number;
  retryable: boolean;
}

export interface SelectedObjectUnavailableEvent {
  labels: string[];
  reason: 'ineligible' | 'taken' | 'exhausted' | (string & {});
  code?: string;
}

export type SeatLayerViewMode =
  | 'flat'
  | 'iso'
  | 'perspective'
  | (string & {});

export type SelectionValidator =
  | { type: 'minimumSelectedPlaces'; minimum: number }
  | { type: 'consecutiveSeats' }
  | { type: 'noOrphanSeats' };

export type SelectionViolation =
  | 'numberOfPlacesToSelect'
  | 'minimumSelectedPlaces'
  | 'consecutiveSeats'
  | 'noOrphanSeats'
  | (string & {});

export interface BundleInfo {
  protocol: ProtocolRange;
  version?: string;
  platform?: string;
  commands: string[];
  events: string[];
  capabilities: string[];
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

export interface SelectionValidity {
  isValid: boolean;
  count: number;
  required: number;
  remaining: number;
  seats: SelectedSeat[];
  violations: SelectionViolation[];
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
  selectionValidityChanged: SelectionValidity;
  selectionValid: SelectedSeat[];
  selectionInvalid: SelectionValidity;
  selectionLimit: number;
  accessExpired: BuyerAccessExpiredEvent;
  accessUnavailable: BuyerAccessUnavailableEvent;
  selectedObjectsUnavailable: SelectedObjectUnavailableEvent;
  unknownEvent: UnknownEvent;
}
