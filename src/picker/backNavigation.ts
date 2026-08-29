import {
  reduceSeatLayerPickerPresentationState,
  type SeatLayerPickerPresentationState,
} from './presentationState';

export type SeatLayerPickerBackAction =
  | { readonly type: 'dismissPrompt' }
  | { readonly type: 'collapseSheet' }
  | { readonly type: 'dismissPendingConfirmation' }
  | { readonly type: 'showOverview' }
  | { readonly type: 'delegateToHost' };

export interface SeatLayerPickerBackResult {
  readonly state: SeatLayerPickerPresentationState;
  /** The UI or host owns execution of this action. */
  readonly action: SeatLayerPickerBackAction;
}

export interface SeatLayerPickerBackStart extends SeatLayerPickerBackResult {
  /** False when an existing local rung is still executing. */
  readonly started: boolean;
}

/**
 * Holds the active command-backed rung synchronously. This keeps a rapid
 * second Back local even if React has already rendered the overview state.
 */
export class SeatLayerPickerBackCoordinator {
  private inFlight: SeatLayerPickerBackAction | undefined;

  begin(
    state: SeatLayerPickerPresentationState,
    localWorkInFlight = false,
  ): SeatLayerPickerBackStart {
    const immediate = reduceSeatLayerPickerBack(state);
    // Prompt and sheet are visual/local rungs. They retain priority even
    // while a lower command-backed rung is still finishing.
    if (immediate.action.type === 'dismissPrompt' || immediate.action.type === 'collapseSheet') {
      return { ...immediate, started: true };
    }
    if (this.inFlight !== undefined) {
      return { state, action: this.inFlight, started: false };
    }
    if (localWorkInFlight) {
      return {
        state,
        action: { type: 'dismissPendingConfirmation' },
        started: false,
      };
    }
    const result = immediate;
    if (
      result.action.type === 'dismissPendingConfirmation' ||
      result.action.type === 'showOverview'
    ) {
      this.inFlight = result.action;
    }
    return { ...result, started: true };
  }

  complete(action: SeatLayerPickerBackAction): void {
    if (this.inFlight === action) this.inFlight = undefined;
  }

  /** True when hardware Back must remain inside the picker synchronously. */
  wouldConsume(
    state: SeatLayerPickerPresentationState,
    localWorkInFlight = false,
  ): boolean {
    return this.inFlight !== undefined || localWorkInFlight ||
      reduceSeatLayerPickerBack(state).action.type !== 'delegateToHost';
  }

  /** A replacement starts with no command-owned back rung. */
  reset(): void {
    this.inFlight = undefined;
  }
}

/**
 * Consumes exactly one back rung: prompt, sheet, confirmation, focused
 * section/overview, then the host. It remains pure so no host navigation or
 * bridge command can accidentally occur from this coordinator.
 */
export function reduceSeatLayerPickerBack(
  state: SeatLayerPickerPresentationState,
): SeatLayerPickerBackResult {
  if (state.prompt !== null) {
    return {
      state: reduceSeatLayerPickerPresentationState(state, { type: 'dismissPrompt' }),
      action: { type: 'dismissPrompt' },
    };
  }
  if (state.sheet === 'expanded') {
    return {
      state: reduceSeatLayerPickerPresentationState(state, { type: 'setSheet', sheet: 'collapsed' }),
      action: { type: 'collapseSheet' },
    };
  }
  if (state.pendingConfirmation !== null) {
    return {
      state,
      action: { type: 'dismissPendingConfirmation' },
    };
  }
  if (state.focusedSection !== null || !state.isOverview) {
    return {
      state,
      action: { type: 'showOverview' },
    };
  }
  return { state, action: { type: 'delegateToHost' } };
}
