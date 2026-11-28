import { SeatLayerError } from '../errors';
import { asBoolean, asObject, asString, type JsonObject } from '../json';
import type { SeatLayerController } from '../controller';
import {
  SeatLayerPageController,
  seatLayerPageOperationId,
  type SeatLayerPageEvents,
} from '../surface/pageController';
import {
  decodeSeatLayerSeasonHandoff,
  decodeSeatLayerSeasonHeldOrder,
  decodeSeatLayerSeasonStatus,
  type SeatLayerSeasonBookedStatus,
  type SeatLayerSeasonCloseOutcome,
  type SeatLayerSeasonHandoff,
  type SeatLayerSeasonHeldOrder,
  type SeatLayerSeasonStatus,
} from './models';

export interface SeatLayerSeasonEvents extends SeatLayerPageEvents<SeatLayerSeasonHandoff> {
  /** Every status line: loading, ready (with the dates), held, booked, … */
  status: SeatLayerSeasonStatus;
}

/** How a close the buyer asked for ended, and the hold it was about. */
export interface SeatLayerSeasonClose {
  readonly outcome: SeatLayerSeasonCloseOutcome;
  /** The hold it was about. Kept: reopen on it with `initialOperationId`. */
  readonly operationId?: string;
}

/**
 * Drives one Season page: its events through `on`, its commands as methods.
 * The web `SeasonPicker`'s callbacks and methods, over the bridge. Create one
 * per screen and dispose it with the screen.
 */
export class SeatLayerSeasonController extends SeatLayerPageController<
  SeatLayerSeasonHandoff,
  SeatLayerSeasonEvents
> {
  private currentStatus: SeatLayerSeasonStatus | undefined;
  private readonly handoffs = new Map<string, SeatLayerSeasonHandoff>();

  constructor(session?: SeatLayerController) {
    super('season', {
      continue: 'season.continue',
      accessExpired: 'season.accessExpired',
      accessUnavailable: 'season.accessUnavailable',
    }, session);
  }

  /** A fresh caller-stable id for a hold. Keep it to retry the same hold. */
  static newOperationId(): string {
    return seatLayerPageOperationId('sop');
  }

  /** A fresh caller-stable id for a release. */
  static newReleaseActionId(): string {
    return seatLayerPageOperationId('sra');
  }

  /** The page's last status line. */
  get status(): SeatLayerSeasonStatus | undefined {
    return this.currentStatus;
  }

  /**
   * Holds the seats named by `labels` for every date of the package.
   * `priceTypes` maps a seat label to its price type on a package priced by type.
   */
  async holdSameSeat(
    labels: readonly string[],
    options: { operationId?: string; priceTypes?: Readonly<Record<string, string>> } = {},
  ): Promise<SeatLayerSeasonHandoff> {
    return this.handoff(await this.run('season.holdSameSeat', {
      labels: [...labels],
      operationId: options.operationId ?? SeatLayerSeasonController.newOperationId(),
      ...(options.priceTypes === undefined ? {} : { priceTypes: { ...options.priceTypes } }),
    }));
  }

  /** Holds the best `quantity` seats the page finds. */
  async holdBestAvailable(
    quantity: number,
    options: {
      operationId?: string;
      categoryKey?: string;
      zoneId?: string;
      accessibility?: readonly string[];
      requireContiguous?: boolean;
    } = {},
  ): Promise<SeatLayerSeasonHandoff> {
    const payload: JsonObject = {
      qty: quantity,
      operationId: options.operationId ?? SeatLayerSeasonController.newOperationId(),
    };
    if (options.categoryKey !== undefined) payload.categoryKey = options.categoryKey;
    if (options.zoneId !== undefined) payload.zoneId = options.zoneId;
    if (options.accessibility !== undefined) payload.accessibility = [...options.accessibility];
    if (options.requireContiguous !== undefined) payload.requireContiguous = options.requireContiguous;
    return this.handoff(await this.run('season.holdBestAvailable', payload));
  }

  /** Opens on a hold your app already has. Undefined when it is no longer held. */
  async restoreOperation(operationId: string): Promise<SeatLayerSeasonHandoff | undefined> {
    const result = await this.run('season.restoreOperation', { operationId });
    return decodeSeatLayerSeasonHandoff(asObject(result)?.handoff);
  }

  /** Back to choosing seats. */
  async chooseSeats(): Promise<void> {
    await this.run('season.chooseSeats', {});
  }

  /** Switches to the package `planActivationId`. */
  async choosePackage(planActivationId: string): Promise<void> {
    await this.run('season.choosePackage', { planActivationId });
  }

  override async markBooked(options: { operationId?: string } = {}): Promise<SeatLayerSeasonBookedStatus> {
    return super.markBooked(options);
  }

  /** Lets the held seats go. True only when they were released; a booked hold never is. */
  async release(options: { releaseActionId?: string } = {}): Promise<boolean> {
    const result = await this.run('season.release', {
      releaseActionId: options.releaseActionId ?? SeatLayerSeasonController.newReleaseActionId(),
    });
    return asBoolean(asObject(result)?.released) === true;
  }

  /** The held order as the page prices it, or undefined with nothing held. */
  async getHeldOrder(): Promise<SeatLayerSeasonHeldOrder | undefined> {
    const result = await this.run('season.getHeldOrder', {});
    return decodeSeatLayerSeasonHeldOrder(asObject(result)?.heldOrder);
  }

  /**
   * The buyer pressed close or Back. With seats held the page asks whether to
   * release or keep them, so there is no deadline; the outcome says what to
   * do with the screen.
   */
  async requestClose(): Promise<SeatLayerSeasonClose> {
    const result = asObject(await this.run('season.requestClose', {}, true));
    const operationId = asString(result?.operationId);
    return {
      outcome: asString(result?.outcome) ?? 'stayed',
      ...(operationId === undefined ? {} : { operationId }),
    };
  }

  /** Paints the page light or dark in place, without a reload. Null: the page's own. */
  async setThemeMode(mode: 'light' | 'dark' | null): Promise<void> {
    await this.run('season.setThemeMode', { mode });
  }

  protected override decodeHold(value: unknown): SeatLayerSeasonHandoff | undefined {
    const handoff = decodeSeatLayerSeasonHandoff(value);
    if (handoff !== undefined) this.handoffs.set(handoff.operationId, handoff);
    return handoff;
  }

  protected override handlePageEvent(name: string, payload: JsonObject | undefined): boolean | undefined {
    if (name !== 'season.status') return undefined;
    const status = decodeSeatLayerSeasonStatus(payload);
    if (status === undefined) return false;
    this.currentStatus = status;
    this.emit('status', status);
    const booked = status.operationId === undefined ? undefined : this.handoffs.get(status.operationId);
    if (status.kind === 'booked' && booked !== undefined) this.reportBooked(booked);
    return true;
  }

  protected override forgetPage(): void {
    super.forgetPage();
    this.currentStatus = undefined;
  }

  private handoff(result: unknown): SeatLayerSeasonHandoff {
    const handoff = this.decodeHold(asObject(result)?.handoff);
    if (handoff === undefined) {
      throw new SeatLayerError('bad_payload', 'The Season page answered without a hold.');
    }
    return handoff;
  }
}
