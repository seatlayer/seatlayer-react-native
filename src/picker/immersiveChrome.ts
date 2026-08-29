import type { SelectedSeat } from '../types';
import type { SeatLayerPickerSnapshot, SeatLayerSeatView } from './models';
import type { SeatLayerPickerThemeData } from './theme';
import { seatLayerPickerConfirmIdentity } from './confirmCardIdentity';
import { seatLayerPickerTokens } from './tokens.g';

export type SeatLayerVenue3DAction = 'back' | 'previous' | 'next' | 'reset' | 'recentre';

export type SeatLayerVenue3DActionPlan = Readonly<{
  view: 'map' | 'venue3d';
  options?: Readonly<{ flyToSeatId?: string; resetView?: boolean }>;
}>;

export interface SeatLayerImmersiveRequestIdentity {
  readonly controller: object;
  readonly scopeSessionId: number;
  readonly runtimeSessionId: string | undefined;
}

function wording(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Light maps use the canonical dark ground without discarding brand accents. */
export function resolveSeatLayerPickerImmersiveTheme(
  theme: SeatLayerPickerThemeData,
): SeatLayerPickerThemeData {
  if (theme.themeMode === 'dark') return theme;
  const ground = seatLayerPickerTokens.color.dark;
  return Object.freeze({
    ...theme,
    themeMode: 'dark',
    colors: Object.freeze({
      ...theme.colors,
      background: ground.background,
      divider: ground.divider,
      error: ground.error,
      mapBackground: ground.mapBackground,
      mapRowLabel: ground.mapRowLabel,
      mapSelection: ground.mapSelection,
      mapText: ground.mapText,
      mutedText: ground.mutedText,
      surface: ground.surface,
      text: ground.text,
    }),
  });
}

export function seatLayerVenue3DIsOwned(input: Readonly<{
  buyerView: unknown;
  hasSnapshotFeature: boolean;
  nativeContract: boolean;
  setBuyerView: boolean;
}>): boolean {
  return input.buyerView === 'venue3d' && input.hasSnapshotFeature &&
    input.nativeContract && input.setBuyerView;
}

/** Optional navigation mode is independent of the always-present 3D actions. */
export function seatLayerVenue3DNavigationIsOwned(input: Readonly<{
  buyerView: unknown;
  hasSnapshotFeature: boolean;
  nativeContract: boolean;
  setBuyerView: boolean;
  navigationCapability: boolean;
  setNavigationMode: boolean;
}>): boolean {
  return seatLayerVenue3DIsOwned(input) && input.navigationCapability && input.setNavigationMode;
}

export function seatLayerPanoramaIsOwned(input: Readonly<{
  hasContent: boolean;
  hasSnapshotFeature: boolean;
  nativeContract: boolean;
  nativeSeatViewCapability: boolean;
  seatViewEvent: boolean;
}>): boolean {
  return input.hasContent && input.hasSnapshotFeature && input.nativeContract &&
    input.nativeSeatViewCapability && input.seatViewEvent;
}

export type SeatLayerPanoramaWording = Readonly<{
  title?: string;
  caption?: string;
  badge?: string;
  dragHint?: string;
  summary?: string;
}>;

/** Runtime wording is display data: trim it once and never render blank chrome. */
export function projectSeatLayerPanoramaWording(
  view: SeatLayerSeatView | undefined,
): SeatLayerPanoramaWording {
  const title = wording(view?.title);
  const caption = wording(view?.caption);
  const badge = wording(view?.badge);
  const dragHint = wording(view?.dragHint);
  return Object.freeze({ title, caption, badge, dragHint, summary: title ?? caption ?? badge });
}

export function seatLayerPanoramaHasContent(view: SeatLayerSeatView | undefined): view is SeatLayerSeatView {
  const wording = projectSeatLayerPanoramaWording(view);
  return wording.summary !== undefined;
}

export function seatLayerVenue3DNeighbours(snapshot: SeatLayerPickerSnapshot | undefined): Readonly<{
  previous?: SelectedSeat;
  target?: SelectedSeat;
  next?: SelectedSeat;
}> {
  const targetId = snapshot?.map.view3DTargetSeatId;
  const index = targetId === undefined || snapshot === undefined
    ? -1
    : snapshot.selection.findIndex((seat) => seat.id === targetId);
  return Object.freeze({
    previous: index > 0 ? snapshot?.selection[index - 1] : undefined,
    target: index >= 0 ? snapshot?.selection[index] : undefined,
    next: index >= 0 && index + 1 < (snapshot?.selection.length ?? 0)
      ? snapshot?.selection[index + 1]
      : undefined,
  });
}

/** Exact contract payload plan; unavailable boundaries deliberately return nothing. */
export function planSeatLayerVenue3DAction(
  action: SeatLayerVenue3DAction,
  snapshot: SeatLayerPickerSnapshot | undefined,
): SeatLayerVenue3DActionPlan | undefined {
  if (snapshot?.map.buyerView !== 'venue3d') return undefined;
  const seats = seatLayerVenue3DNeighbours(snapshot);
  if (action === 'back') return Object.freeze({ view: 'map' });
  if (action === 'reset') return Object.freeze({ view: 'venue3d', options: Object.freeze({ resetView: true }) });
  if (action === 'previous' && seats.previous) {
    return Object.freeze({ view: 'venue3d', options: Object.freeze({ flyToSeatId: seats.previous.id }) });
  }
  if (action === 'next' && seats.next) {
    return Object.freeze({ view: 'venue3d', options: Object.freeze({ flyToSeatId: seats.next.id }) });
  }
  if (action === 'recentre' && seats.target) {
    return Object.freeze({
      view: 'venue3d',
      options: Object.freeze({ flyToSeatId: seats.target.id, resetView: true }),
    });
  }
  return undefined;
}

/** A retained press may never adopt a replacement controller or runtime session. */
export function seatLayerImmersiveRequestIsCurrent(
  origin: SeatLayerImmersiveRequestIdentity,
  current: SeatLayerImmersiveRequestIdentity,
): boolean {
  return origin.controller === current.controller &&
    origin.scopeSessionId === current.scopeSessionId &&
    origin.runtimeSessionId === current.runtimeSessionId;
}

/** Isolated dispatch seam keeps the exact public wire payload testable. */
export async function dispatchSeatLayerVenue3DAction(
  controller: Readonly<{
    setBuyerView(
      view: string,
      options?: { flyToSeatId?: string; resetView?: boolean },
    ): Promise<unknown>;
  }>,
  plan: SeatLayerVenue3DActionPlan,
): Promise<void> {
  await controller.setBuyerView(plan.view, plan.options);
}

/** Exact wire dispatch for the optional move/rotate camera control. */
export async function dispatchSeatLayerVenue3DNavigationMode(
  controller: Readonly<{ setVenue3DNavigationMode(mode: string): Promise<unknown> }>,
  mode: string,
): Promise<void> {
  await controller.setVenue3DNavigationMode(mode);
}

/** The host replacement is deliberately isolated from the built-in map command. */
export async function dispatchSeatLayerVenue3DBackOverride(
  onBackToVenue: () => Promise<unknown> | unknown,
): Promise<void> {
  await onBackToVenue();
}

export function seatLayerVenue3DCaption(
  seat: SelectedSeat | undefined,
  sectionId: string | undefined,
  translate: (key: string, options?: { values?: Record<string, string> }) => string,
  viewFromYourSeat: string,
): string | undefined {
  if (!seat) return undefined;
  const identity = seatLayerPickerConfirmIdentity(seat, sectionId, translate);
  const parts = [wording(identity), wording(viewFromYourSeat)]
    .filter((part): part is string => part !== undefined)
    .join(' · ');
  return parts || undefined;
}

export function seatLayerImmersiveDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : seatLayerPickerTokens.motion.duration.immersive;
}

export function seatLayerImmersiveInsetPlan(
  active: boolean,
  topInset: number,
  bottomInset: number,
): Readonly<{ top: number; bottom: number }> | undefined {
  if (!active) return undefined;
  const target = seatLayerPickerTokens.size.minimumHitTarget;
  return Object.freeze({
    top: Math.max(0, topInset) + target,
    bottom: Math.max(0, bottomInset) + target * 2,
  });
}
