import {
  resolveSeatLayerPickerLayoutMode,
  resolveSeatLayerPickerOptions,
  type SeatLayerPickerOptions,
  type SeatLayerPickerResolvedOptions,
} from './options';

export interface SeatLayerPickerAdaptivePlan {
  readonly layout: 'phone' | 'wide';
  readonly options: SeatLayerPickerResolvedOptions;
  readonly sideRailWidth: number;
}

/** Resolves the ready-made inner layout without making a runtime or UI decision. */
export function planSeatLayerPickerAdaptiveLayout(
  width: unknown,
  options: SeatLayerPickerOptions | unknown,
): SeatLayerPickerAdaptivePlan {
  const measuredWidth = typeof width === 'number' && Number.isFinite(width) ? width : undefined;
  const resolved = resolveSeatLayerPickerOptions(options, measuredWidth);
  const layout = resolveSeatLayerPickerLayoutMode(resolved.layout, measuredWidth);
  return Object.freeze({ layout, options: resolved, sideRailWidth: 360 });
}

/** Fatal/loading surfaces and native buyer prompts own the chart interaction channel. */
export function seatLayerPickerAdaptiveInteractionBlocked(
  ready: boolean,
  fatalError: unknown,
  hasPrompt: boolean,
): boolean {
  return !ready || fatalError !== undefined || hasPrompt;
}

/** A stable positive candidate epoch for one pending inventory identity. */
export function seatLayerPickerPendingCandidateEpoch(id: string): number {
  return seatLayerPickerPendingCandidateEpochFor({ id });
}

export interface SeatLayerPickerPendingCandidateIdentity {
  readonly id: string;
  readonly controller?: object;
  readonly scopeSessionId?: number;
  readonly runtimeSessionId?: string;
}

const controllerKeys = new WeakMap<object, number>();
let controllerKeyCount = 0;

/** Keeps a retained decision candidate scoped to its controller and both sessions. */
export function seatLayerPickerPendingCandidateEpochFor(identity: SeatLayerPickerPendingCandidateIdentity): number {
  const controller = identity.controller;
  let controllerKey = 0;
  if (controller !== undefined) {
    controllerKey = controllerKeys.get(controller) ?? 0;
    if (controllerKey === 0) {
      controllerKey = ++controllerKeyCount;
      controllerKeys.set(controller, controllerKey);
    }
  }
  const input = `${identity.id.length}:${identity.id}:${controllerKey}:${identity.scopeSessionId ?? -1}:${identity.runtimeSessionId ?? ''}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

export function seatLayerPickerInitialSheet(initiallyCollapsed: boolean): 'collapsed' | 'expanded' {
  return initiallyCollapsed ? 'collapsed' : 'expanded';
}

export interface SeatLayerPickerPhoneBandInput {
  readonly topHeight: number;
  readonly dockHeight: number;
  readonly controlBottomHeight: number;
  readonly floorSelectorBottomHeight: number;
  readonly accessibilityBottomHeight: number;
  readonly venueBottomHeight: number;
}

export const seatLayerPickerPhoneRailTop = 8;
export const seatLayerPickerPhoneChromeTop = 44;
export const seatLayerPickerPhoneRailGap = 8;
export const seatLayerPickerPhoneLegendHeight = 46;

/** Only chrome physically above the phone map contributes to runtime framing. */
export function planSeatLayerPickerPhoneBands(input: SeatLayerPickerPhoneBandInput): Readonly<{
  top: number;
  bottom: number;
}> {
  const height = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
  return Object.freeze({
    top: height(input.topHeight),
    bottom: height(input.dockHeight) + Math.max(
      height(input.venueBottomHeight),
      (() => {
        const lower = Math.max(height(input.controlBottomHeight), height(input.accessibilityBottomHeight));
        const floor = height(input.floorSelectorBottomHeight);
        return floor > 0 && lower > 0 ? lower + seatLayerPickerPhoneRailGap + floor : Math.max(lower, floor);
      })(),
    ),
  });
}
