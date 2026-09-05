import type { JsonObject, JsonValue } from '../json';
import type {
  CategoryTier,
  GAArea,
  ReadyInfo,
  SelectedSeat,
  SelectionValidity,
} from '../types';

export const seatLayerPickerSnapshotSchema = 'seatlayer.picker.snapshot/1';
export const seatLayerAllFloors = 'all';

export type SeatLayerPickerHoldOwner = 'picker' | 'host' | (string & {});

export interface SeatLayerPickerEventDetails {
  readonly key: string;
  readonly name: string;
  readonly mode: string;
  readonly currency: string;
  readonly venue?: string;
  readonly startsAt?: number;
  readonly timezone?: string;
  readonly locale?: string;
  readonly posterUrl?: string;
  readonly salesClosed: boolean;
}

export interface SeatLayerPickerBranding {
  readonly brandName?: string;
  readonly logoUrl?: string;
  readonly attributionRequired: boolean;
  readonly accent?: string;
  readonly accentInk?: string;
  readonly background?: string;
  readonly surface?: string;
  readonly text?: string;
  readonly muted?: string;
  readonly line?: string;
  readonly fontFamily?: string;
  readonly radius?: number;
}

export interface SeatLayerPickerCategory {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly priceMin: number;
  readonly priceMax: number;
  readonly available: number;
  /**
   * Remaining seats in the category — the `N left` number, from
   * `category-availability-v1`. PRESENT-ONLY, and that is why it exists beside
   * `available`: `available` reports 0 for a count that has not landed yet, so
   * absent here means NOT KNOWN and only `free: 0` means sold out.
   */
  readonly free?: number;
  readonly notForSale: boolean;
  readonly tiers: readonly CategoryTier[];
}

export interface SeatLayerPickerZone {
  readonly id: string;
  readonly label: string;
  readonly color?: string;
}

export interface SeatLayerPickerSectionSummary {
  readonly id: string;
  readonly label: string;
  readonly displayLabel?: string;
  readonly zoneId?: string;
  readonly zoneLabel?: string;
  readonly entrance?: string;
  readonly color?: string;
  readonly dominantCategoryKey?: string;
  readonly seatsLeft?: number;
  readonly priceMin?: number;
  readonly priceMax?: number;
  /**
   * Free spaces in this section per access provision, from
   * `section-access-counts-v1`. PRESENT-ONLY at every level: a provision
   * appears only when it was counted and at least one is free, and the whole
   * field is absent for a section holding none and before a renderer exists.
   * Absent therefore means NOT COUNTED, never zero, and it describes the floor
   * the map is currently on.
   */
  readonly accessibleFree?: Readonly<Record<string, number>>;
}

export interface SeatLayerPickerCartLine {
  readonly lineKey: string;
  readonly label: string;
  readonly displayLabel?: string;
  readonly displayType?: string;
  readonly objectId: string;
  readonly objectType: string;
  readonly categoryKey: string;
  readonly tierId?: string;
  readonly unitPrice: number;
  readonly currency: string;
  readonly quantity: number;
  readonly seatId?: string;
  readonly sectionLabel?: string;
  readonly rowLabel?: string;
  readonly seatNumber?: string;
}

export interface SeatLayerPickerCheckoutHandoff {
  readonly holdId: string;
  readonly expiresAt: number;
  readonly currency: string;
  readonly lineItems: readonly SeatLayerPickerCartLine[];
  readonly total: number;
}

export interface SeatLayerPickerHold {
  readonly active: boolean;
  readonly expiresAt?: number;
  readonly owner?: SeatLayerPickerHoldOwner;
}

export interface SeatLayerPickerViewportInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}
export interface SeatLayerPickerFloorInfo {
  readonly id: string;
  readonly name: string;
  readonly level?: number;
}
export interface SeatLayerPickerAccessNeed {
  readonly key: string;
  readonly count: number;
}
export interface SeatLayerPickerMapState {
  readonly rung: string;
  readonly viewMode: string;
  readonly buyerView: string;
  readonly view3DNavigationMode: string;
  readonly view3DTargetSeatId?: string;
  readonly view3DTargetSeat?: Readonly<SelectedSeat>;
  readonly view3DPreviousSeatId?: string | null;
  readonly view3DNextSeatId?: string | null;
  readonly view3DFocusedSectionId?: string | null;
  readonly activeFloorId?: string;
  readonly focusedSectionId?: string;
  readonly focusedSection?: SeatLayerPickerSectionSummary;
  readonly colorblindSafe: boolean;
  readonly hideLimitedView: boolean;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly categoryFilter: readonly string[];
  readonly accessibilityFilter: readonly string[];
  readonly accessNeeds?: readonly SeatLayerPickerAccessNeed[];
  readonly floors: readonly SeatLayerPickerFloorInfo[];
  readonly floorMode?: string;
  readonly floorLabelStyle?: string;
  readonly viewportInsets?: SeatLayerPickerViewportInsets;
}

/**
 * Where a seat is in the map container's own CSS pixels, from
 * `seat-screen-point-v1` — the same `worldToScreen` the web confirm card
 * anchors to. Absent before a renderer is attached and for a seat the chart
 * carries no geometry for, so a card must have a placement that does not need
 * it.
 */
export interface SeatLayerPickerSeatScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The organizer's real view-from-seat photograph, as the buyer-asset REFERENCE
 * the host resolves over the authenticated transport — never a URL an image
 * view could fetch on its own. `kind` is always `'real'`: with no uploaded
 * photograph the whole field is absent rather than carrying a stand-in.
 */
export interface SeatLayerPickerSeatViewThumb {
  readonly reference: string;
  readonly kind: 'real';
}

/**
 * The seat confidence passport's summary. It describes SUPPLIED evidence and
 * its known limits; it is never a guarantee about the real view.
 */
export interface SeatLayerPickerSeatConfidence {
  readonly headline: string;
  readonly model: string;
  readonly reality: string;
  readonly coverage: string;
  readonly provenance: string;
  readonly freshness: string;
  readonly limitations: readonly string[];
  readonly modeledTarget?: string;
}

/**
 * A selected seat plus everything the 0.80.3 contract lets a shell's own card
 * say about it. Every addition is present-only.
 */
export interface SeatLayerPickerSelectedSeat extends SelectedSeat {
  /** `seat-screen-point-v1`. */
  readonly screenPoint?: SeatLayerPickerSeatScreenPoint;
  /** `seat-view-thumbnail-v1`. */
  readonly seatViewThumb?: SeatLayerPickerSeatViewThumb;
  /**
   * `seat-view-thumbnail-v1`. Distance from the seat to the stage. Absent on a
   * chart with no stage shape — a bare focal point never justifies the claim.
   */
  readonly sightlineMetres?: number;
  /** `seat-view-thumbnail-v1`. Present only for a seat carrying evidence. */
  readonly seatViewConfidence?: SeatLayerPickerSeatConfidence;
}

/**
 * A rectangle of the map surface the shell's own chrome covers, in the map's
 * CSS pixels — the same frame as the viewport insets. The runtime swallows
 * every pointer sequence that starts inside one, in the capture phase, so a
 * tap on a native disc cannot also reach the map beneath it.
 */
export interface SeatLayerPickerBlockedRegion {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** `picker.frameSeat` options. */
export interface SeatLayerPickerFrameSeatOptions {
  /** Where in the clear band the seat comes to rest, 0..1. Runtime default 0.48. */
  readonly fraction?: number;
  /** Defaults to true; reduced motion snaps regardless. */
  readonly animate?: boolean;
  /**
   * The renderer's camera-gesture count read when the card opened. Passing it
   * back makes a later re-frame answer `dy: 0` once the buyer has moved the
   * map themselves, so the picker never argues with the finger.
   */
  readonly gestures?: number;
}

/**
 * What `picker.frameSeat` did. `dy: 0` is the ordinary answer for a seat
 * already in place, an unknown seat, insets that leave no band, an engine with
 * no pan primitive, and a stale gesture count — never an error.
 */
export interface SeatLayerPickerFrameSeatResult {
  readonly dy: number;
  readonly gestures: number;
}

/** One stop on the accessible-section tour, or `null` when nothing matches. */
export interface SeatLayerPickerAccessibleSectionStep {
  readonly id: string;
  readonly label: string;
  readonly free: number;
  /** 0-based position in the tour. */
  readonly index: number;
  readonly total: number;
}

/** The protocol-2 state contract. It deliberately has no host-only chrome node. */
export interface SeatLayerPickerSnapshot {
  readonly schema: typeof seatLayerPickerSnapshotSchema;
  readonly sessionId: string;
  readonly revision: number;
  readonly event: SeatLayerPickerEventDetails;
  readonly branding: SeatLayerPickerBranding;
  readonly categories: readonly SeatLayerPickerCategory[];
  readonly zones: readonly SeatLayerPickerZone[];
  readonly sections: readonly SeatLayerPickerSectionSummary[];
  readonly generalAdmissionAreas: readonly Readonly<GAArea>[];
  readonly bestAvailableZones: readonly SeatLayerPickerZone[];
  readonly map: SeatLayerPickerMapState;
  readonly selection: readonly Readonly<SeatLayerPickerSelectedSeat>[];
  readonly selectionValidity?: Readonly<SelectionValidity>;
  readonly maxSelection: number;
  readonly ticketCount: number;
  readonly cartLines: readonly SeatLayerPickerCartLine[];
  readonly cartTotal: number;
  readonly currency: string;
  readonly hold: SeatLayerPickerHold;
  readonly accessConfigured: boolean;
  readonly accessStatus: string;
  readonly accessReason?: string;
  readonly capabilities: readonly string[];
  readonly raw: JsonValue;
}

export interface SeatLayerPickerReadyInfo extends ReadyInfo {
  readonly snapshot?: SeatLayerPickerSnapshot;
}

export interface SeatLayerSeatView {
  readonly seatId?: string;
  readonly title?: string;
  readonly caption?: string;
  readonly badge?: string;
  readonly real: boolean;
  readonly generated: boolean;
  readonly dragHint?: string;
}

export interface SeatLayerPickerBridgeOptions {
  readonly config?: JsonObject;
}
