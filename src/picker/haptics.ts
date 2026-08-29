import { seatLayerPickerTokens } from './tokens.g';

export type SeatLayerPickerHapticCue = Exclude<keyof typeof seatLayerPickerTokens.haptics, 'note'>;

export interface SeatLayerPickerHapticSnapshot {
  readonly selectionCount?: number | null;
  readonly focusedSectionId?: string | null;
  readonly hasHold?: boolean | null;
}

export interface SeatLayerPickerHapticPolicyState {
  readonly seeded: boolean;
  readonly selectionCount: number;
  readonly focusedSectionId: string | null;
  readonly hasHold: boolean;
  /** Explicit expiry is re-armed only by a genuinely new active hold. */
  readonly holdLifecycle: 'inactive' | 'active' | 'expiredAwaitingInactive' | 'reportedInactive';
}

export interface SeatLayerPickerHapticPolicyResult {
  readonly state: SeatLayerPickerHapticPolicyState;
  readonly cues: readonly SeatLayerPickerHapticCue[];
}

export const seatLayerPickerInitialHapticPolicyState: SeatLayerPickerHapticPolicyState = Object.freeze({ seeded: false, selectionCount: 0, focusedSectionId: null, hasHold: false, holdLifecycle: 'inactive' });

function selectionCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function stateFromSnapshot(snapshot: SeatLayerPickerHapticSnapshot, lifecycle: SeatLayerPickerHapticPolicyState['holdLifecycle']): SeatLayerPickerHapticPolicyState {
  return {
    seeded: true,
    selectionCount: selectionCount(snapshot.selectionCount),
    focusedSectionId: snapshot.focusedSectionId ?? null,
    hasHold: lifecycle === 'active',
    holdLifecycle: lifecycle,
  };
}

/** Starts a new handshake/session with no inherited haptic history. */
export function resetSeatLayerPickerHapticPolicy(): SeatLayerPickerHapticPolicyState {
  return seatLayerPickerInitialHapticPolicyState;
}

/**
 * The first snapshot seeds comparison state silently. Later snapshots emit at
 * most one cue per supported transition and never treat hold release as expiry.
 */
export function reduceSeatLayerPickerHapticSnapshot(
  state: SeatLayerPickerHapticPolicyState,
  snapshot: SeatLayerPickerHapticSnapshot,
): SeatLayerPickerHapticPolicyResult {
  const snapshotHasHold = snapshot.hasHold === true;
  if (!state.seeded) {
    const lifecycle = state.holdLifecycle === 'expiredAwaitingInactive'
      ? snapshotHasHold ? 'expiredAwaitingInactive' : 'reportedInactive'
      : snapshotHasHold ? 'active' : state.holdLifecycle;
    return { state: stateFromSnapshot(snapshot, lifecycle), cues: [] };
  }

  const lifecycle = snapshotHasHold
    ? state.holdLifecycle === 'expiredAwaitingInactive' ? 'expiredAwaitingInactive' : 'active'
    : state.holdLifecycle === 'expiredAwaitingInactive' ? 'reportedInactive'
    : state.holdLifecycle === 'reportedInactive' ? 'reportedInactive' : 'inactive';
  const next = stateFromSnapshot(snapshot, lifecycle);

  const cues: SeatLayerPickerHapticCue[] = [];
  if (next.selectionCount > state.selectionCount) cues.push('selectionAdded');
  if (next.focusedSectionId !== null && next.focusedSectionId !== state.focusedSectionId) cues.push('sectionFocused');
  if ((state.holdLifecycle === 'inactive' || state.holdLifecycle === 'reportedInactive') && next.holdLifecycle === 'active') cues.push('holdCreated');
  return { state: next, cues };
}

/** Hold expiry is an explicit runtime signal, distinct from a deliberate release. */
export function signalSeatLayerPickerHoldExpired(
  state: SeatLayerPickerHapticPolicyState,
): SeatLayerPickerHapticPolicyResult {
  return state.holdLifecycle === 'expiredAwaitingInactive' || state.holdLifecycle === 'reportedInactive'
    ? { state, cues: [] }
    : {
      state: {
        ...state,
        hasHold: false,
        holdLifecycle: state.seeded && state.holdLifecycle === 'inactive' ? 'reportedInactive' : 'expiredAwaitingInactive',
      },
      cues: ['holdExpired'],
    };
}
