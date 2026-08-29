import type { ReactNode } from 'react';

import type { SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerSnapshot } from './models';

export type SeatLayerPickerPartName =
  | 'header'
  | 'legend'
  | 'floorSelector'
  | 'floorStrip'
  | 'sectionNavigator'
  | 'dockBar'
  | 'accessibilityFilters'
  | 'map'
  | 'mapControls'
  | 'bestAvailable'
  | 'seatConfirmation'
  | 'confirmCard'
  | 'generalAdmissionPrompt'
  | 'tablePrompt'
  | 'cartList'
  | 'cartSheet'
  | 'venue3D'
  | 'seatViewChrome'
  | 'holdLapse'
  | 'actionError'
  | 'checkoutBar'
  | 'loading'
  | 'error'
  | 'empty';

/** The exact active scope and default child for one replaceable ready-made part. */
export interface SeatLayerPickerPartContext {
  readonly part: SeatLayerPickerPartName;
  readonly scope: SeatLayerPickerScopeValue;
  readonly snapshot: SeatLayerPickerSnapshot | undefined;
  readonly controller: SeatLayerPickerController;
  readonly defaultChild: ReactNode;
}

export type SeatLayerPickerPartBuilder = (context: SeatLayerPickerPartContext) => ReactNode;

/** Optional builder slots. Aliases retain the same canonical part context. */
export interface SeatLayerPickerBuilders {
  readonly header?: SeatLayerPickerPartBuilder;
  readonly legend?: SeatLayerPickerPartBuilder;
  readonly priceRail?: SeatLayerPickerPartBuilder;
  readonly floorSelector?: SeatLayerPickerPartBuilder;
  readonly floorStrip?: SeatLayerPickerPartBuilder;
  readonly sectionNavigator?: SeatLayerPickerPartBuilder;
  readonly dockBar?: SeatLayerPickerPartBuilder;
  readonly accessibilityFilters?: SeatLayerPickerPartBuilder;
  readonly map?: SeatLayerPickerPartBuilder;
  readonly chart?: SeatLayerPickerPartBuilder;
  readonly mapControls?: SeatLayerPickerPartBuilder;
  readonly bestAvailable?: SeatLayerPickerPartBuilder;
  readonly seatConfirmation?: SeatLayerPickerPartBuilder;
  readonly confirmCard?: SeatLayerPickerPartBuilder;
  readonly generalAdmissionPrompt?: SeatLayerPickerPartBuilder;
  readonly tablePrompt?: SeatLayerPickerPartBuilder;
  readonly cartList?: SeatLayerPickerPartBuilder;
  readonly selectionTray?: SeatLayerPickerPartBuilder;
  readonly cartSheet?: SeatLayerPickerPartBuilder;
  readonly venue3D?: SeatLayerPickerPartBuilder;
  readonly seatViewChrome?: SeatLayerPickerPartBuilder;
  readonly holdLapse?: SeatLayerPickerPartBuilder;
  readonly holdCountdown?: SeatLayerPickerPartBuilder;
  readonly actionError?: SeatLayerPickerPartBuilder;
  readonly checkoutBar?: SeatLayerPickerPartBuilder;
  readonly loading?: SeatLayerPickerPartBuilder;
  readonly error?: SeatLayerPickerPartBuilder;
  readonly empty?: SeatLayerPickerPartBuilder;
}

const aliases: Readonly<Record<SeatLayerPickerPartName, readonly string[]>> = Object.freeze({
  header: Object.freeze(['header']),
  legend: Object.freeze(['legend', 'priceRail']),
  floorSelector: Object.freeze(['floorSelector']),
  floorStrip: Object.freeze(['floorStrip']),
  sectionNavigator: Object.freeze(['sectionNavigator']),
  dockBar: Object.freeze(['dockBar']),
  accessibilityFilters: Object.freeze(['accessibilityFilters']),
  map: Object.freeze(['map', 'chart']),
  mapControls: Object.freeze(['mapControls']),
  bestAvailable: Object.freeze(['bestAvailable']),
  seatConfirmation: Object.freeze(['seatConfirmation']),
  /** Phone confirmation may reuse the wide replacement; wide never adopts phone chrome. */
  confirmCard: Object.freeze(['confirmCard', 'seatConfirmation']),
  generalAdmissionPrompt: Object.freeze(['generalAdmissionPrompt']),
  tablePrompt: Object.freeze(['tablePrompt']),
  cartList: Object.freeze(['cartList', 'selectionTray']),
  cartSheet: Object.freeze(['cartSheet']),
  venue3D: Object.freeze(['venue3D']),
  seatViewChrome: Object.freeze(['seatViewChrome']),
  holdLapse: Object.freeze(['holdLapse', 'holdCountdown']),
  actionError: Object.freeze(['actionError']),
  checkoutBar: Object.freeze(['checkoutBar']),
  loading: Object.freeze(['loading']),
  error: Object.freeze(['error']),
  empty: Object.freeze(['empty']),
});

function ownData(source: unknown, key: string): unknown {
  try {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function report(scope: SeatLayerPickerScopeValue, error: unknown): void {
  try {
    scope.reportError(error);
  } catch {
    // A host reporter is observational and cannot change the fallback child.
  }
}

function isThenable(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false;
  try {
    if (value instanceof Promise) return true;
    let current: object | null = value as object;
    for (let depth = 0; current !== null && depth < 8; depth += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(current, 'then');
      if (descriptor !== undefined) return !('value' in descriptor) || typeof descriptor.value === 'function';
      current = Object.getPrototypeOf(current);
    }
  } catch {
    return true;
  }
  return false;
}

function discardRejectedPromise(value: unknown): void {
  try {
    if (value instanceof Promise) void value.catch(() => undefined);
  } catch {
    // Invalid async UI is already contained by the synchronous fallback.
  }
}

/** Returns a valid own-data builder, resolving aliases only when the primary slot is absent or invalid. */
export function resolveSeatLayerPickerPartBuilder(
  builders: SeatLayerPickerBuilders | unknown,
  part: SeatLayerPickerPartName,
): SeatLayerPickerPartBuilder | undefined {
  for (const slot of aliases[part]) {
    const candidate = ownData(builders, slot);
    if (typeof candidate === 'function') return candidate as SeatLayerPickerPartBuilder;
  }
  return undefined;
}

/** Creates one immutable context without cloning the live scope, controller, snapshot, or actions. */
export function createSeatLayerPickerPartContext(
  scope: SeatLayerPickerScopeValue,
  part: SeatLayerPickerPartName,
  defaultChild: ReactNode,
): SeatLayerPickerPartContext {
  return Object.freeze({
    part,
    scope,
    snapshot: scope.snapshot,
    controller: scope.controller,
    defaultChild,
  });
}

/** Invokes at most one synchronous builder and contains invalid async output. */
export function renderSeatLayerPickerPart(
  builders: SeatLayerPickerBuilders | unknown,
  scope: SeatLayerPickerScopeValue,
  part: SeatLayerPickerPartName,
  defaultChild: ReactNode,
): ReactNode {
  const builder = resolveSeatLayerPickerPartBuilder(builders, part);
  if (builder === undefined) return defaultChild;
  const context = createSeatLayerPickerPartContext(scope, part, defaultChild);
  try {
    const child = builder(context);
    if (isThenable(child)) {
      discardRejectedPromise(child);
      report(scope, new Error(`SeatLayer picker builder "${part}" must return synchronous React UI.`));
      return defaultChild;
    }
    return child;
  } catch (error) {
    report(scope, error);
    return defaultChild;
  }
}
