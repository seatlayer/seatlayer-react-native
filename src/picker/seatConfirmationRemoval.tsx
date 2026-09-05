import React from 'react';

import { seatLayerSeatViewThumbnailCapability } from '../bridge/protocol';
import type { SelectedSeat } from '../types';
import { SeatLayerPickerBuyerAssetLoader } from './buyerAssetLoader';
import type { SeatLayerPickerSelectedSeat } from './models';
import { seatLayerPickerSeatIdentity } from './pendingConfirmationState';
import {
  useSeatLayerPickerSeatRemoval,
  type SeatLayerPickerConfirmCardMode, type SeatLayerPickerSeatRetapPolicy,
} from './seatRetap';
import type {
  SeatLayerPickerConfirmationAction, SeatLayerPickerConfirmationActions,
  SeatLayerPickerConfirmationModel,
} from './seatConfirmationState';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';

/**
 * §3.8.4a — the remove question, and the evidence both questions draw from.
 *
 * The remove card is the SAME card: same box, same placement, same spotlight
 * glass, same identity grid, band and photograph. Only the primary answer
 * changes, so it is modelled as one more mode of the confirmation model rather
 * than as a card of its own.
 */

export interface SeatLayerPickerConfirmCardModel extends SeatLayerPickerConfirmationModel {
  readonly mode: SeatLayerPickerConfirmCardMode;
}

/** The add question, as the card sees it. */
export function seatLayerPickerConfirmCardModel(
  model: SeatLayerPickerConfirmationModel,
): SeatLayerPickerConfirmCardModel {
  return Object.freeze({ ...model, mode: 'add' as const });
}

export interface SeatLayerPickerSeatEvidence {
  readonly assetLoader: SeatLayerPickerBuyerAssetLoader | undefined;
  /** The authored photograph's reference, on `seat-view-thumbnail-v1` only. */
  readonly photoReference: string | undefined;
  /** Metres to the stage, already rounded the way the runtime prints it. */
  readonly sightlineMetres: number | undefined;
}

const loaders = new WeakMap<object, { key: string; loader: SeatLayerPickerBuyerAssetLoader }>();

/**
 * Whether the bundle speaks the seat-view fields at all. Read off the
 * handshake, not off the snapshot: a runtime that predates them simply omits
 * them, and the card is then the card it was before this existed.
 */
export function seatLayerPickerSupportsSeatViewThumbnails(scope: SeatLayerPickerScopeValue): boolean {
  try {
    return scope.controller.mapController.supportsPickerCapability(seatLayerSeatViewThumbnailCapability);
  } catch { return false; }
}

/** One session-scoped transport per controller, bound to the picker's event. */
export function seatLayerPickerAssetLoaderFor(
  scope: SeatLayerPickerScopeValue,
): SeatLayerPickerBuyerAssetLoader | undefined {
  const event = scope.configuration?.event;
  if (typeof event !== 'string' || event.length === 0) return undefined;
  const key = `${scope.sessionId}:${event}`;
  const held = loaders.get(scope.controller);
  if (held !== undefined && held.key === key) return held.loader;
  held?.loader.clear();
  const loader = SeatLayerPickerBuyerAssetLoader.fromConfiguration(scope.configuration);
  loaders.set(scope.controller, { key, loader });
  return loader;
}

/** What the card may say about one seat beyond its own identity. */
export function useSeatLayerPickerSeatEvidence(
  scope: SeatLayerPickerScopeValue,
  seat: SelectedSeat,
): SeatLayerPickerSeatEvidence {
  const supported = seatLayerPickerSupportsSeatViewThumbnails(scope);
  const evidence = seat as SeatLayerPickerSelectedSeat;
  const reference = supported ? evidence.seatViewThumb?.reference : undefined;
  const metres = supported ? evidence.sightlineMetres : undefined;
  const loader = React.useMemo(
    () => supported ? seatLayerPickerAssetLoaderFor(scope) : undefined,
    [scope.configuration, scope.controller, scope.sessionId, supported],
  );
  return React.useMemo(() => Object.freeze({
    assetLoader: loader,
    photoReference: typeof reference === 'string' && reference.length > 0 ? reference : undefined,
    sightlineMetres: typeof metres === 'number' && Number.isFinite(metres) ? metres : undefined,
  }), [loader, metres, reference]);
}

/**
 * The remove question, or `undefined` when there is none.
 *
 * Cancel, the outside tap, the drag and the back gesture all leave the seat
 * where it is; only the primary takes it back out, down the same path the
 * cart's ✕ uses (`picker.removeCartLine`).
 */
export function seatLayerPickerRemovalPolicy(
  scope: SeatLayerPickerScopeValue,
): SeatLayerPickerSeatRetapPolicy {
  const pending = scope.pendingSeat;
  return Object.freeze({
    hasPendingAdd: pending !== null,
    pendingSeatIdentity: pending === null ? null : seatLayerPickerSeatIdentity(pending),
    readOnly: scope.readOnly,
  });
}

/** The session key the remove question is held under. */
export function seatLayerPickerRemovalSessionKey(scope: SeatLayerPickerScopeValue): string {
  return `${scope.sessionId}:${scope.snapshot?.sessionId ?? ''}`;
}

/**
 * Whether a remove card is up, for a reader that draws nothing itself — the
 * layout's spotlight glass and its map-gesture gate both turn on it.
 */
export function useSeatLayerPickerSeatRemovalSeat(): SelectedSeat | null {
  const scope = useSeatLayerPickerScope();
  const removal = useSeatLayerPickerSeatRemoval(
    scope.controller,
    seatLayerPickerRemovalPolicy(scope),
    scope.snapshot?.selection ?? emptySelection,
    seatLayerPickerRemovalSessionKey(scope),
  );
  return scope.pendingSeat === null ? removal.seatAwaitingRemoval : null;
}

export function useSeatLayerPickerConfirmCardRemoval(
  props: SeatLayerPickerConfirmationActions,
): SeatLayerPickerConfirmCardModel | undefined {
  const scope = useSeatLayerPickerScope();
  const selection = scope.snapshot?.selection ?? emptySelection;
  const pending = scope.pendingSeat;
  const removal = useSeatLayerPickerSeatRemoval(
    scope.controller,
    seatLayerPickerRemovalPolicy(scope),
    selection,
    seatLayerPickerRemovalSessionKey(scope),
  );
  const [busy, setBusy] = React.useState(false);
  const seat = removal.seatAwaitingRemoval;
  const dismiss = removal.dismissSeatRemoval;
  const propsRef = React.useRef(props);
  propsRef.current = props;
  const run = React.useCallback((action: SeatLayerPickerConfirmationAction) => {
    if (seat === null) return;
    const observe = () => {
      try {
        void Promise.resolve(propsRef.current.onAction?.(Object.freeze({ action, seat: seat as never })))
          .catch(() => undefined);
      } catch { /* observational */ }
    };
    if (action === 'cancel') { dismiss(); observe(); return; }
    if (action === 'confirm') {
      if (busy) return;
      setBusy(true);
      void scope.controller.removeCartLine(seat.label)
        .then(() => { dismiss(); observe(); })
        .catch((error: unknown) => { try { scope.reportError(error); } catch { /* contained */ } })
        .finally(() => setBusy(false));
      return;
    }
    if (action === 'venue3d') void scope.controller.setBuyerView('venue3d', { flyToSeatId: seat.id }).catch(() => undefined);
    if (action === 'seatView') void scope.controller.openSeatView(seat.id).catch(() => undefined);
    observe();
  }, [busy, dismiss, scope.controller, scope.reportError, seat]);
  const inspection = React.useMemo(
    () => seatLayerPickerRemovalInspection(scope, props),
    [props.show3D, props.showSeatView, scope.controller, scope.snapshot],
  );
  if (seat === null || pending !== null) return undefined;
  return Object.freeze({
    busy: busy || scope.isBusy,
    candidate: undefined,
    inspection,
    mode: 'remove' as const,
    observedSeat: seat as never,
    run,
    scope,
    seat,
    setTierId: noTier,
    tierId: undefined,
  });
}

function seatLayerPickerRemovalInspection(
  scope: SeatLayerPickerScopeValue,
  props: SeatLayerPickerConfirmationActions,
): readonly Readonly<{ kind: 'seatView' | 'venue3d'; label: string }>[] {
  const capabilities = scope.snapshot?.capabilities ?? [];
  return Object.freeze([
    ...(props.showSeatView !== false && capabilities.includes('seatView') && scope.controller.supportsSeatView
      ? [Object.freeze({ kind: 'seatView' as const, label: scope.strings.translate('viewFromHere') })] : []),
    ...(props.show3D !== false && capabilities.includes('venue3d') && scope.controller.supportsVenue3D
      ? [Object.freeze({ kind: 'venue3d' as const, label: scope.strings.translate('venue3D') })] : []),
  ]);
}

const emptySelection: readonly SelectedSeat[] = Object.freeze([]);
const noTier: React.Dispatch<React.SetStateAction<string | null | undefined>> = () => undefined;
