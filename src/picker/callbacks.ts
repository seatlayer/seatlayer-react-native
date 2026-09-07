import type {
  BuyerAccessExpiredEvent,
  BuyerAccessUnavailableEvent,
  ReadyInfo,
  SelectedObjectUnavailableEvent,
  SelectedSeat,
  SelectionValidity,
} from '../types';
import type { SeatLayerError } from '../errors';
import type { SeatLayerChartLoad } from './chartLoad';
import type { SeatLayerPickerCheckoutHandoff, SeatLayerPickerHold } from './models';

export type SeatLayerPickerCloseReason =
  | 'closeButton'
  | 'systemBack'
  | 'barrier'
  | 'programmatic';

/** Optional host observations for the ready-made picker. */
export interface SeatLayerPickerCallbacks {
  readonly onReady?: (info: ReadyInfo) => void | Promise<void>;
  readonly onChartLoad?: (load: SeatLayerChartLoad) => void | Promise<void>;
  readonly onSelectionChanged?: (selection: readonly SelectedSeat[]) => void | Promise<void>;
  readonly onSelectionValidityChanged?: (validity: SelectionValidity) => void | Promise<void>;
  readonly onHoldChanged?: (
    hold: SeatLayerPickerHold | undefined,
    handoff: SeatLayerPickerCheckoutHandoff | undefined,
  ) => void | Promise<void>;
  readonly onHoldExpired?: () => void | Promise<void>;
  /**
   * The handed-off hold settled to booked — the sale landed. It fires once,
   * never on the hand-off itself: a buyer on the way to pay has not paid
   * (§3.13). A host drawing its own confirmation screen listens here and sets
   * `showBookedOverlay: false`.
   */
  readonly onBooked?: (handoff: SeatLayerPickerCheckoutHandoff) => void | Promise<void>;
  readonly onAccessExpired?: (event: BuyerAccessExpiredEvent) => void | Promise<void>;
  readonly onAccessUnavailable?: (event: BuyerAccessUnavailableEvent) => void | Promise<void>;
  readonly onSelectedObjectUnavailable?: (event: SelectedObjectUnavailableEvent) => void | Promise<void>;
  readonly onClosed?: (reason: SeatLayerPickerCloseReason) => void | Promise<void>;
  readonly onError?: (error: SeatLayerError) => void | Promise<void>;
  readonly onThemeResolved?: (theme: 'light' | 'dark') => void | Promise<void>;
  readonly onSectionFocused?: (sectionId: string) => void | Promise<void>;
  readonly onSeatSelected?: (seat: SelectedSeat) => void | Promise<void>;
  readonly onSeatRemoved?: (label: string) => void | Promise<void>;
  readonly onSeatViewOpened?: (seat: SelectedSeat) => void | Promise<void>;
  /**
   * Opens the seat's confidence passport. Supplying it turns the 3D card's
   * confidence teaser (§3.8.7) into a chip; without it the teaser stays the
   * static row, because a chip beside a dead target would say nothing.
   */
  readonly onSeatConfidence?: (seat: SelectedSeat) => void | Promise<void>;
  readonly onContinue?: (handoff: SeatLayerPickerCheckoutHandoff) => void | Promise<void>;
}
