import {
  type SeatLayerCartLineLike,
  type TicketIdentity,
  ticketIdentityOf,
} from "./cartDense";
import { seatLayerPickerTokens } from "./tokens.g";

export const nativeUndoWindowMs =
  seatLayerPickerTokens.motion.durationOutsideBudget.undoWindow;

export interface NativeUndoTimer {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CartRemoveIntent<T extends SeatLayerCartLineLike> {
  readonly kind: "remove";
  readonly lines: readonly T[];
  /** Stable inventory label for picker.removeCartLine. */
  readonly labels: readonly string[];
}

export interface CartRestoreIntent {
  readonly kind: "restore";
  /** Exact picker.selectObjects payload; no display string is reconstructed. */
  readonly objects: readonly string[];
}

export type NativeRemovalPhase = "awaiting-remove" | "undo-window" | "restoring";

export interface ActiveNativeUndo<T extends SeatLayerCartLineLike> {
  readonly token: number;
  readonly sessionId: number;
  readonly line: T;
  readonly identity: TicketIdentity;
  readonly phase: NativeRemovalPhase;
  /** A folded run is one buyer intent and one undo opportunity. */
  readonly lines: readonly T[];
  readonly restoreObjects: readonly string[];
}

export interface CartRemovalUndoState<T extends SeatLayerCartLineLike> {
  readonly nextToken: number;
  readonly active: ActiveNativeUndo<T> | null;
}

export interface BeginCartRemovalResult<T extends SeatLayerCartLineLike> {
  readonly state: CartRemovalUndoState<T>;
  readonly intent: CartRemoveIntent<T> | null;
  readonly settled: ActiveNativeUndo<T> | null;
}

export interface AcknowledgeRemovalResult<T extends SeatLayerCartLineLike> {
  readonly state: CartRemovalUndoState<T>;
  readonly accepted: boolean;
}

export interface FailedCartRemoval<T extends SeatLayerCartLineLike> {
  readonly state: CartRemovalUndoState<T>;
  /** The caller may render this snapshot-owned line again; no insertion occurs here. */
  readonly restored: readonly T[];
}

export interface UndoCartRemovalResult<T extends SeatLayerCartLineLike> {
  readonly state: CartRemovalUndoState<T>;
  readonly intent: CartRestoreIntent | null;
  readonly settled: ActiveNativeUndo<T> | null;
}

export interface ExpiredCartRemoval<T extends SeatLayerCartLineLike> {
  readonly state: CartRemovalUndoState<T>;
  readonly committed: ActiveNativeUndo<T> | null;
}

/**
 * Transport-free local coordinator. Begin hides a snapshot line and returns a
 * remove intent; acknowledgement—not command latency—opens the exact native
 * undo window. The host owns bridge dispatch and authoritative snapshots.
 */
export class CartRemovalUndoCoordinator<T extends SeatLayerCartLineLike> {
  private stateValue: CartRemovalUndoState<T> = { nextToken: 1, active: null };
  private timerHandle: unknown = null;

  constructor(
    private readonly timer: NativeUndoTimer,
    private readonly onExpired?: (result: ExpiredCartRemoval<T>) => void,
  ) {}

  get state(): CartRemovalUndoState<T> {
    return freezeState(this.stateValue);
  }

  begin(line: T, sessionId = 0): BeginCartRemovalResult<T> {
    return this.beginMany([line], sessionId);
  }

  beginMany(lines: readonly T[], sessionId = 0): BeginCartRemovalResult<T> {
    const line = lines[0];
    if (!line) {
      return {
        state: freezeState(this.stateValue),
        intent: null,
        settled: null,
      };
    }
    const identity = ticketIdentityOf(line);
    const restoreObjects = lines.map((item) =>
      ticketIdentityOf(item).removalLabel
    )
      .filter((label): label is string => label !== null);
    if (
      identity.removalLabel === null || restoreObjects.length !== lines.length
    ) {
      return {
        state: freezeState(this.stateValue),
        intent: null,
        settled: null,
      };
    }
    const settled = this.clearActive();
    const active: ActiveNativeUndo<T> = {
      token: this.stateValue.nextToken,
      sessionId,
      line,
      identity,
      phase: "awaiting-remove",
      lines: Object.freeze([...lines]),
      restoreObjects: Object.freeze([...restoreObjects]),
    };
    this.stateValue = { nextToken: active.token + 1, active };
    return {
      state: freezeState(this.stateValue),
      intent: Object.freeze({
        kind: "remove",
        lines: active.lines,
        labels: active.restoreObjects,
      }),
      settled: freezeActive(settled),
    };
  }

  /** Opens one four-second undo window only for the current successful command. */
  acknowledgeSuccess(token: number): AcknowledgeRemovalResult<T> {
    const active = this.stateValue.active;
    if (
      active === null || active.token !== token ||
      active.phase !== "awaiting-remove"
    ) {
      return { state: freezeState(this.stateValue), accepted: false };
    }
    const acknowledged: ActiveNativeUndo<T> = {
      ...active,
      phase: "undo-window",
    };
    this.stateValue = { ...this.stateValue, active: acknowledged };
    this.timerHandle = this.timer.setTimeout(
      () => this.expire(token),
      nativeUndoWindowMs,
    );
    return { state: freezeState(this.stateValue), accepted: true };
  }

  /** A failed remove abandons only its current optimistic hide. */
  failRemoval(token: number): FailedCartRemoval<T> {
    const active = this.stateValue.active;
    if (
      active === null || active.token !== token ||
      active.phase !== "awaiting-remove"
    ) {
      return {
        state: freezeState(this.stateValue),
        restored: Object.freeze([]),
      };
    }
    this.clearActive();
    return { state: freezeState(this.stateValue), restored: active.lines };
  }

  undo(token: number, sessionId = 0): UndoCartRemovalResult<T> {
    const active = this.stateValue.active;
    if (
      active === null || active.token !== token ||
      active.phase !== "undo-window" || active.sessionId !== sessionId
    ) {
      return {
        state: freezeState(this.stateValue),
        intent: null,
        settled: null,
      };
    }
    const label = active.identity.removalLabel;
    if (label !== null) this.stateValue = {
      ...this.stateValue,
      active: { ...active, phase: "restoring" },
    };
    return {
      state: freezeState(this.stateValue),
      intent: label === null
        ? null
        : Object.freeze({ kind: "restore", objects: active.restoreObjects }),
      settled: null,
    };
  }

  completeUndo(token: number): boolean {
    const active = this.stateValue.active;
    if (
      active === null || active.token !== token || active.phase !== "restoring"
    ) return false;
    this.clearActive();
    return true;
  }

  /** A failed restore remains retryable only until the original deadline. */
  failUndo(token: number): boolean {
    const active = this.stateValue.active;
    if (active === null || active.token !== token || active.phase !== "restoring") {
      return false;
    }
    this.stateValue = { ...this.stateValue, active: { ...active, phase: "undo-window" } };
    return true;
  }

  /**
   * Keep an absent line hidden: that is the normal successful-remove snapshot.
   * A matching authoritative reappearance settles the window as restored.
   */
  reconcile(items: readonly T[]): CartRemovalUndoState<T> {
    const active = this.stateValue.active;
    if (
      active === null || (active.phase !== "undo-window" && active.phase !== "restoring") ||
      !active.lines.every((hidden) =>
        items.some((line) =>
          sameCartIdentity(ticketIdentityOf(hidden), ticketIdentityOf(line))
        )
      )
    ) {
      return freezeState(this.stateValue);
    }
    this.clearActive();
    return freezeState(this.stateValue);
  }

  /** Hides exactly the active snapshot line; it never inserts a local line. */
  projectVisibleLines(items: readonly T[]): readonly T[] {
    const active = this.stateValue.active;
    return Object.freeze(active === null
      ? [...items]
      : items.filter((line) =>
        !active.lines.some((hidden) =>
          sameCartIdentity(ticketIdentityOf(hidden), ticketIdentityOf(line))
        )
      ));
  }

  reset(): void {
    this.clearActive();
  }

  dispose(): void {
    this.clearActive();
  }

  private expire(token: number): void {
    const active = this.stateValue.active;
    if (
      active === null || active.token !== token ||
      (active.phase !== "undo-window" && active.phase !== "restoring")
    ) return;
    this.timerHandle = null;
    this.stateValue = { ...this.stateValue, active: null };
    try {
      this.onExpired?.({
        state: freezeState(this.stateValue),
        committed: freezeActive(active),
      });
    } catch { /* expiry is observational */ }
  }

  private clearActive(): ActiveNativeUndo<T> | null {
    const active = this.stateValue.active;
    this.clearTimer();
    if (active !== null) this.stateValue = { ...this.stateValue, active: null };
    return active;
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      this.timer.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }
}

function freezeState<T extends SeatLayerCartLineLike>(
  state: CartRemovalUndoState<T>,
): CartRemovalUndoState<T> {
  return Object.freeze({
    ...state,
    active: freezeActive(state.active),
  });
}

function freezeActive<T extends SeatLayerCartLineLike>(
  active: ActiveNativeUndo<T> | null,
): ActiveNativeUndo<T> | null {
  if (active === null) return null;
  return Object.freeze({
    ...active,
    identity: Object.freeze({ ...active.identity }),
    lines: Object.freeze([...active.lines]),
    restoreObjects: Object.freeze([...active.restoreObjects]),
  });
}

function sameCartIdentity(
  left: TicketIdentity,
  right: TicketIdentity,
): boolean {
  if (left.removalLabel !== null) {
    return left.removalLabel === right.removalLabel;
  }
  if (left.seatId !== null) return left.seatId === right.seatId;
  return left.objectId !== null && left.objectId === right.objectId;
}
