import { SeatLayerError } from '../errors';
import { asBoolean, asObject, asString, type JsonObject } from '../json';
import type { SeatLayerController } from '../controller';
import { SeatLayerPageController, type SeatLayerPageEvents } from '../surface/pageController';
import {
  decodeSeatLayerRunDescriptor,
  decodeSeatLayerRunHandoff,
  decodeSeatLayerRunStatus,
  type SeatLayerRunBookedStatus,
  type SeatLayerRunDescriptor,
  type SeatLayerRunHandoff,
  type SeatLayerRunSelectionMode,
  type SeatLayerRunStatus,
} from './models';

export interface SeatLayerRunEvents extends SeatLayerPageEvents<SeatLayerRunHandoff> {
  /** The run the page opened: its name and performances. Once per page. */
  run: SeatLayerRunDescriptor;
  /** Every status line: pending, sales closed, a recovery that failed, … */
  status: SeatLayerRunStatus;
  /** The selection mode changed. */
  selectionMode: SeatLayerRunSelectionMode;
}

/**
 * Drives one run page: its events through `on`, its commands as methods. The
 * web `PerformanceGroupPicker`'s callbacks and methods, over the bridge.
 * Create one per screen and dispose it with the screen.
 */
export class SeatLayerRunController extends SeatLayerPageController<SeatLayerRunHandoff, SeatLayerRunEvents> {
  private currentDescriptor: SeatLayerRunDescriptor | undefined;
  private currentSelectionMode: SeatLayerRunSelectionMode | undefined;
  private currentStatus: SeatLayerRunStatus | undefined;

  constructor(session?: SeatLayerController) {
    super('group', {
      continue: 'group.checkout',
      accessExpired: 'group.access.expired',
      accessUnavailable: 'group.access.unavailable',
    }, session);
  }

  /** The run the page shows, once it is ready. */
  get descriptor(): SeatLayerRunDescriptor | undefined {
    return this.currentDescriptor;
  }

  /** The same seat for every performance, or a choice per performance. */
  get selectionMode(): SeatLayerRunSelectionMode | undefined {
    return this.currentSelectionMode;
  }

  /** The page's last status line. */
  get status(): SeatLayerRunStatus | undefined {
    return this.currentStatus;
  }

  /** Hands the held seats off, as the buyer's Continue does. A hold already handed off is answered as it is. */
  async continueToCheckout(): Promise<SeatLayerRunHandoff> {
    const handoff = decodeSeatLayerRunHandoff(asObject(await this.run('group.continue', {}))?.handoff);
    if (handoff === undefined) throw new SeatLayerError('bad_payload', 'The run page answered without a hold.');
    return handoff;
  }

  /** The hold the page has, or undefined. */
  async getHeldOrder(): Promise<SeatLayerRunHandoff | undefined> {
    return decodeSeatLayerRunHandoff(asObject(await this.run('group.getHeldOrder', {}))?.heldOrder);
  }

  /**
   * @internal Puts the page's hold in `hold` when no event has named one: a
   * hold the page resumed at boot. The app's bar reads its clock from it.
   */
  async readHeldOrder(): Promise<void> {
    if (this.hold !== undefined) return;
    const held = await this.getHeldOrder();
    if (held === undefined || this.hold !== undefined || !this.isReady) return;
    this.setHold(held);
    this.emit('changed', undefined);
  }

  /** Lets the whole hold go. True only when it is gone; a booked hold is never released. */
  async release(): Promise<boolean> {
    return asBoolean(asObject(await this.run('group.release', {}))?.released) === true;
  }

  /** Switches between one seat for every performance and a choice per performance. The selection is cleared. True when the mode changed. */
  async setSelectionMode(mode: SeatLayerRunSelectionMode): Promise<boolean> {
    return asBoolean(asObject(await this.run('group.setSelectionMode', { mode }))?.changed) === true;
  }

  override async markBooked(options: { operationId?: string } = {}): Promise<SeatLayerRunBookedStatus> {
    return super.markBooked(options);
  }

  protected override decodeHold(value: unknown): SeatLayerRunHandoff | undefined {
    return decodeSeatLayerRunHandoff(value);
  }

  protected override handlePageEvent(name: string, payload: JsonObject | undefined): boolean | undefined {
    switch (name) {
      case 'group.ready': {
        const descriptor = decodeSeatLayerRunDescriptor(payload?.performanceGroup);
        if (descriptor === undefined) return false;
        this.currentDescriptor = descriptor;
        const mode = asString(payload?.selectionMode);
        if (mode !== undefined) this.currentSelectionMode = mode;
        this.emit('run', descriptor);
        return true;
      }
      case 'group.status': {
        const status = decodeSeatLayerRunStatus(payload);
        if (status === undefined) return false;
        this.currentStatus = status;
        this.emit('status', status);
        return true;
      }
      case 'group.booked': {
        const handoff = decodeSeatLayerRunHandoff(payload?.handoff);
        if (handoff !== undefined) this.reportBooked(handoff);
        return false;
      }
      case 'group.selectionMode.changed': {
        const mode = asString(payload?.selectionMode);
        if (mode === undefined) return false;
        this.currentSelectionMode = mode;
        this.emit('selectionMode', mode);
        return false;
      }
      default:
        return undefined;
    }
  }

  protected override forgetPage(): void {
    super.forgetPage();
    this.currentDescriptor = undefined;
    this.currentSelectionMode = undefined;
    this.currentStatus = undefined;
  }
}
