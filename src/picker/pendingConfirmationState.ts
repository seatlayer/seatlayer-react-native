import {
  type ConfirmedCartProjection,
  projectConfirmedCart,
  type SeatLayerCartLineLike,
  type SeatLayerSelectedSeatLike,
} from "./cartDense";

export type { SeatLayerSelectedSeatLike } from "./cartDense";

/** The immutable portion of a picker snapshot this local coordinator needs. */
export interface PickerSelectionSnapshotLike {
  readonly sessionId: string;
  readonly revision: number;
  readonly selection: readonly SeatLayerSelectedSeatLike[];
  readonly hold?: { readonly active?: boolean; readonly owner?: string };
}

export interface PendingDeselectionIntent {
  /** Renderer seat identity when supplied by the snapshot. */
  readonly id: string | null;
  /** Stable inventory label accepted by the deselection command. */
  readonly label: string;
  /** Parent chart-object identity, retained without deriving it from display text. */
  readonly objectId: string | null;
  /** Stable local correlation for completing this exact cancellation. */
  readonly key: string;
}

export interface PendingConfirmationState {
  readonly sessionId: string | null;
  readonly revision: number | null;
  readonly selection: readonly SeatLayerSelectedSeatLike[];
  readonly answered: readonly string[];
  readonly pending: SeatLayerSelectedSeatLike | null;
  /** Tracks a config/read-only policy change even when revision is unchanged. */
  readonly confirmationEnabled: boolean;
}

/** Inputs are deliberately small so scope policy remains independent of layout. */
export interface PendingConfirmationPolicy {
  readonly confirmationEnabled: boolean;
}

export interface CancelPendingResult {
  readonly state: PendingConfirmationState;
  readonly intent: PendingDeselectionIntent | null;
}

export const initialPendingConfirmationState =
  (): PendingConfirmationState => Object.freeze({
    sessionId: null,
    revision: null,
    selection: Object.freeze([]),
    answered: Object.freeze([]),
    pending: null,
    confirmationEnabled: true,
  });

/** Starts a new picker session without retaining an answered/pending seat. */
export function resetPendingConfirmationState(): PendingConfirmationState {
  return initialPendingConfirmationState();
}

/**
 * Applies only newer immutable snapshots. The selection's last unanswered
 * seat wins, which makes a rapid multi-pick surface the newest confirmation
 * first without inserting a local field into the runtime snapshot.
 */
export function applyPendingConfirmationSnapshot(
  state: PendingConfirmationState,
  snapshot: PickerSelectionSnapshotLike,
  policy: PendingConfirmationPolicy = enabledPendingConfirmationPolicy,
): PendingConfirmationState {
  const confirmationEnabled = policy.confirmationEnabled === true;
  if (state.sessionId === snapshot.sessionId && state.revision !== null) {
    if (snapshot.revision < state.revision) return state;
    if (snapshot.revision === state.revision && state.confirmationEnabled === confirmationEnabled) return state;
  }

  const sessionChanged = state.sessionId !== snapshot.sessionId ||
    state.confirmationEnabled !== confirmationEnabled;
  const selection = Object.freeze([...snapshot.selection]);
  const present = new Set(
    selection.map(selectionKey).filter((key): key is string => key !== null),
  );
  const answered = sessionChanged
    ? Object.freeze([])
    : Object.freeze(state.answered.filter((key) => present.has(key)));
  const next = {
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    selection,
    answered,
    confirmationEnabled,
  } as const;
  return confirmationEnabled && snapshot.hold?.active !== true
    ? withPending(next)
    : Object.freeze({ ...next, pending: null });
}

/** Only an explicit bridge opt-out or an active read-only lease suppresses cards. */
export function seatLayerPickerPendingConfirmationPolicy(
  bridgeConfig: unknown,
  readOnly: unknown,
): PendingConfirmationPolicy {
  return Object.freeze({
    confirmationEnabled: readOnly !== true && ownBoolean(bridgeConfig, 'confirmSelection') !== false,
  });
}

/** Marks the current card answered locally; no select intent is emitted. */
export function confirmPending(
  state: PendingConfirmationState,
): PendingConfirmationState {
  const key = state.pending === null ? null : selectionKey(state.pending);
  if (key === null || state.answered.includes(key)) return state;
  return withPending({ ...state, answered: Object.freeze([...state.answered, key]) });
}

/**
 * Returns the exact snapshot identity needed by an outer command layer to
 * deselect it. The pending card remains visible until that command succeeds.
 */
export function cancelPending(
  state: PendingConfirmationState,
  expected?: SeatLayerSelectedSeatLike,
): CancelPendingResult {
  if (
    state.pending === null ||
    (expected && !samePendingSeat(state.pending, expected))
  ) {
    return { state, intent: null };
  }
  const key = selectionKey(state.pending);
  const label = text(state.pending.label);
  if (key === null || label === null) return { state, intent: null };
  return {
    state,
    intent: Object.freeze({
      id: text(state.pending.id),
      label,
      objectId: text(state.pending.objectId),
      key,
    }),
  };
}

/** Completes only the cancellation still attached to the current pending seat. */
export function completePendingCancel(
  state: PendingConfirmationState,
  intent: PendingDeselectionIntent,
): PendingConfirmationState {
  if (state.pending === null || selectionKey(state.pending) !== intent.key) {
    return state;
  }
  return withPending({ ...state, answered: Object.freeze([...state.answered, intent.key]) });
}

/**
 * The pending card is the only locally excluded selection. Cart totals remain
 * derived from cart lines, including GA/table quantities, rather than from a
 * snapshot's selection count.
 */
export function confirmedCartForPending<T extends SeatLayerCartLineLike>(
  state: PendingConfirmationState,
  items: readonly T[],
): ConfirmedCartProjection<T> {
  return projectConfirmedCart(items, state.pending);
}

function withPending(
  state: Omit<PendingConfirmationState, "pending"> & {
    readonly pending?: SeatLayerSelectedSeatLike | null;
  },
): PendingConfirmationState {
  const answered = new Set(state.answered);
  let pending: SeatLayerSelectedSeatLike | null = null;
  if (state.pending === null) return Object.freeze({ ...state, pending });
  for (let index = state.selection.length - 1; index >= 0; index -= 1) {
    const seat = state.selection[index]!;
    const key = selectionKey(seat);
    if (key !== null && !answered.has(key)) {
      pending = seat;
      break;
    }
  }
  return Object.freeze({ ...state, pending });
}

/** A structural identity for inventory objects, never derived from display copy. */
export function seatLayerPickerSeatIdentity(
  seat: SeatLayerSelectedSeatLike,
): string | null {
  const id = text(seat.id);
  const label = text(seat.label);
  const objectId = text(seat.objectId);
  if (id === null && label === null && objectId === null) return null;
  return JSON.stringify([id, label, objectId]);
}

export function samePendingSeat(
  left: SeatLayerSelectedSeatLike,
  right: SeatLayerSelectedSeatLike,
): boolean {
  const leftKey = seatLayerPickerSeatIdentity(left);
  return leftKey !== null && leftKey === seatLayerPickerSeatIdentity(right);
}

function selectionKey(seat: SeatLayerSelectedSeatLike): string | null {
  return seatLayerPickerSeatIdentity(seat);
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

const enabledPendingConfirmationPolicy = Object.freeze({ confirmationEnabled: true });

function ownBoolean(value: unknown, key: string): boolean | undefined {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor && typeof descriptor.value === 'boolean'
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}
