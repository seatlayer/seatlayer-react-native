import { SeatLayerPickerController } from './controller';

const attachedBorrowedControllers = new WeakMap<
  SeatLayerPickerController,
  object
>();
const scopeDisposedControllers = new WeakSet<SeatLayerPickerController>();

function disposeOwnedController(controller: SeatLayerPickerController): void {
  scopeDisposedControllers.add(controller);
  controller.dispose();
}

/**
 * Owns the attachment lifetime of exactly one picker controller.
 *
 * A borrowed controller can be mounted by only one scope at a time. The lock
 * deliberately lives outside React so two independently-rendered roots cannot
 * start competing protocol sessions for the same bridge.
 */
export class SeatLayerPickerScopeSession {
  private controller: SeatLayerPickerController;
  private ownsController: boolean;
  private readonly owner = {};
  private attached = false;
  private disposeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(controller?: SeatLayerPickerController) {
    this.controller = controller ?? new SeatLayerPickerController();
    this.ownsController = controller === undefined;
  }

  get currentController(): SeatLayerPickerController {
    return this.controller;
  }

  get ownsCurrentController(): boolean {
    return this.ownsController;
  }

  get isCurrentControllerDisposed(): boolean {
    return scopeDisposedControllers.has(this.controller);
  }

  attach(): void {
    if (this.disposeTimer !== undefined) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = undefined;
    }
    if (this.attached) return;
    const existing = attachedBorrowedControllers.get(this.controller);
    if (existing !== undefined && existing !== this.owner) {
      throw new Error(
        'A borrowed SeatLayerPickerController is already attached to another scope.',
      );
    }
    attachedBorrowedControllers.set(this.controller, this.owner);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    if (attachedBorrowedControllers.get(this.controller) === this.owner) {
      attachedBorrowedControllers.delete(this.controller);
    }
    this.attached = false;
  }

  /**
   * Releases an effect attachment. Owned disposal waits one task so React's
   * development cleanup/re-setup cycle can retain the same session.
   */
  release(): void {
    const controller = this.controller;
    const ownsController = this.ownsController;
    this.detach();
    if (!ownsController || this.disposeTimer !== undefined) return;
    this.disposeTimer = setTimeout(() => {
      this.disposeTimer = undefined;
      if (!this.attached && this.controller === controller && this.ownsController) {
        disposeOwnedController(controller);
      }
    }, 0);
  }

  /** Starts a separate session without disturbing a rejected replacement. */
  replace(controller?: SeatLayerPickerController): void {
    const next = controller ?? new SeatLayerPickerController();
    const nextOwnsController = controller === undefined;
    if (next === this.controller) return;
    const nextLock = attachedBorrowedControllers.get(next);
    if (nextLock !== undefined && nextLock !== this.owner) {
      if (nextOwnsController) disposeOwnedController(next);
      throw new Error(
        'A borrowed SeatLayerPickerController is already attached to another scope.',
      );
    }
    const previous = this.controller;
    const disposePrevious = this.ownsController;
    const wasAttached = this.attached;
    this.detach();
    this.controller = next;
    this.ownsController = nextOwnsController;
    if (wasAttached) {
      attachedBorrowedControllers.set(next, this.owner);
      this.attached = true;
    }
    if (disposePrevious) disposeOwnedController(previous);
  }

  /** Test-only deterministic completion of a deferred release. */
  flushDeferredDisposal(): void {
    if (this.disposeTimer === undefined) return;
    clearTimeout(this.disposeTimer);
    this.disposeTimer = undefined;
    if (!this.attached && this.ownsController) {
      disposeOwnedController(this.controller);
    }
  }

  dispose(): void {
    const controller = this.controller;
    const ownsController = this.ownsController;
    if (this.disposeTimer !== undefined) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = undefined;
    }
    this.detach();
    if (ownsController) disposeOwnedController(controller);
  }
}
