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
  readonly selection: readonly Readonly<SelectedSeat>[];
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
