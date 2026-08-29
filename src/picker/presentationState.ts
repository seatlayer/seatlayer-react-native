export type SeatLayerPickerSheetState = 'collapsed' | 'expanded' | (string & {});
export type SeatLayerPickerPromptKind = 'seatDetails' | 'accessibility' | (string & {});

/** An open prompt is represented explicitly so the caller retains its context. */
export interface SeatLayerPickerPromptState {
  readonly kind: SeatLayerPickerPromptKind;
  readonly context?: unknown;
}

/** A pending confirmation is caller-owned context, not a reconstructed snapshot. */
export interface SeatLayerPickerPendingConfirmationState {
  readonly context?: unknown;
}

export interface SeatLayerPickerFocusedSectionState {
  readonly sectionId: string;
  readonly context?: unknown;
}

export interface SeatLayerPickerPresentationState {
  readonly prompt: SeatLayerPickerPromptState | null;
  readonly sheet: SeatLayerPickerSheetState;
  readonly pendingConfirmation: SeatLayerPickerPendingConfirmationState | null;
  readonly focusedSection: SeatLayerPickerFocusedSectionState | null;
  readonly isOverview: boolean;
  /** Authoritative renderer rung, retained for back and native chrome decisions. */
  readonly mapRung?: string;
}

export const seatLayerPickerInitialPresentationState: SeatLayerPickerPresentationState = Object.freeze({
  prompt: null,
  sheet: 'collapsed',
  pendingConfirmation: null,
  focusedSection: null,
  isOverview: true,
  mapRung: 'overview',
});

export type SeatLayerPickerPresentationEvent =
  | { readonly type: 'openPrompt'; readonly prompt: SeatLayerPickerPromptState }
  | { readonly type: 'dismissPrompt' }
  | { readonly type: 'setSheet'; readonly sheet: SeatLayerPickerSheetState }
  | { readonly type: 'setPendingConfirmation'; readonly pendingConfirmation: SeatLayerPickerPendingConfirmationState | null }
  | { readonly type: 'setFocusedSection'; readonly focusedSection: SeatLayerPickerFocusedSectionState | null }
  | { readonly type: 'setOverview'; readonly isOverview: boolean }
  | { readonly type: 'syncSnapshot'; readonly rung: string; readonly focusedSectionId: string | null };

/** The only local presentation action custom JS layouts may request. */
export type SeatLayerPickerLocalPresentationEvent = Extract<
  SeatLayerPickerPresentationEvent,
  { readonly type: 'setSheet' }
>;

/** Preserves additive events unchanged until a future picker version understands them. */
export function reduceSeatLayerPickerPresentationState(
  state: SeatLayerPickerPresentationState,
  event: SeatLayerPickerPresentationEvent,
): SeatLayerPickerPresentationState {
  switch (event.type) {
    case 'openPrompt':
      return state.prompt === event.prompt ? state : { ...state, prompt: event.prompt };
    case 'dismissPrompt':
      return state.prompt === null ? state : { ...state, prompt: null };
    case 'setSheet':
      return state.sheet === event.sheet ? state : { ...state, sheet: event.sheet };
    case 'setPendingConfirmation':
      return state.pendingConfirmation === event.pendingConfirmation
        ? state
        : { ...state, pendingConfirmation: event.pendingConfirmation };
    case 'setFocusedSection':
      return state.focusedSection === event.focusedSection
        ? state
        : { ...state, focusedSection: event.focusedSection };
    case 'setOverview':
      return state.isOverview === event.isOverview ? state : { ...state, isOverview: event.isOverview };
    case 'syncSnapshot': {
      const focused = event.focusedSectionId === null ? null
        : state.focusedSection?.sectionId === event.focusedSectionId
          ? state.focusedSection
          : Object.freeze({ sectionId: event.focusedSectionId });
      const isOverview = event.rung !== 'seats' || focused === null;
      return state.mapRung === event.rung && state.focusedSection === focused &&
        state.isOverview === isOverview
        ? state
        : { ...state, mapRung: event.rung, focusedSection: focused, isOverview };
    }
  }
}
