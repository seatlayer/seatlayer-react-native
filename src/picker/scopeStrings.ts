import type { SeatLayerConfiguration } from '../types';
import {
  createSeatLayerPickerStringResolver,
  type SeatLayerPickerLocale,
  type SeatLayerPickerStringOverrides,
  type SeatLayerPickerStringResolver,
} from './locale';
import type { SeatLayerPickerSnapshot } from './models';

export interface SeatLayerPickerScopeStringProps {
  readonly locale?: SeatLayerPickerLocale | null;
  readonly strings?: SeatLayerPickerStringOverrides | null;
}

export interface SeatLayerPickerScopeStringInputs {
  readonly hasExplicitLocale: boolean;
  readonly locale: SeatLayerPickerLocale | null | undefined;
  readonly overrides: SeatLayerPickerStringOverrides | null | undefined;
  readonly overrideKey: string;
}

export interface SeatLayerPickerScopeStringResolution {
  readonly locale: SeatLayerPickerLocale | null | undefined;
  readonly overrides: SeatLayerPickerStringOverrides | null | undefined;
  /** Stable unless the override identity or its safe own-data content changes. */
  readonly overrideKey: string;
}

const overrideReferences = new WeakMap<object, number>();
let nextOverrideReference = 1;

function ownDataProperty(value: unknown, key: string): Readonly<{ found: boolean; value: unknown }> {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return Object.freeze({ found: false, value: undefined });
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return Object.freeze({ found: false, value: undefined });
    return Object.freeze({ found: true, value: descriptor.value });
  } catch {
    return Object.freeze({ found: false, value: undefined });
  }
}

function safeLocale(value: unknown): SeatLayerPickerLocale | null | undefined {
  return typeof value === 'string' || value === null ? value : undefined;
}

function referenceKey(value: object): number {
  const existing = overrideReferences.get(value);
  if (existing !== undefined) return existing;
  const next = nextOverrideReference;
  nextOverrideReference += 1;
  overrideReferences.set(value, next);
  return next;
}

function ownDataEntries(value: unknown): readonly (readonly [string, unknown])[] {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return [];
  try {
    return Object.getOwnPropertyNames(value).sort().flatMap((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && 'value' in descriptor ? [[key, descriptor.value] as const] : [];
    });
  } catch {
    return [];
  }
}

function overrideValueKey(value: unknown): string | undefined {
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (typeof value === 'function') return `function:${referenceKey(value)}`;
  return undefined;
}

function accessNeedKey(value: unknown): string {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return 'none';
  const entries = ownDataEntries(value)
    .flatMap(([key, entry]) => {
      const serialized = overrideValueKey(entry);
      return serialized === undefined ? [] : [`${JSON.stringify(key)}=${serialized}`];
    });
  return `access:${referenceKey(value)}:${entries.join(',')}`;
}

function overrideKey(value: unknown): string {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return 'none';
  const entries = ownDataEntries(value)
    .flatMap(([key, entry]) => {
      if (key === 'accessNeeds') return [`accessNeeds=${accessNeedKey(entry)}`];
      const serialized = overrideValueKey(entry);
      return serialized === undefined ? [] : [`${JSON.stringify(key)}=${serialized}`];
    });
  return `overrides:${referenceKey(value)}:${entries.join(',')}`;
}

/** Safely snapshots only the new string props without invoking host accessors. */
export function prepareSeatLayerPickerScopeStringInputs(
  props: SeatLayerPickerScopeStringProps,
): SeatLayerPickerScopeStringInputs {
  const locale = ownDataProperty(props, 'locale');
  const strings = ownDataProperty(props, 'strings');
  return Object.freeze({
    hasExplicitLocale: locale.found && safeLocale(locale.value) !== undefined,
    locale: safeLocale(locale.value),
    overrides: strings.found ? strings.value as SeatLayerPickerStringOverrides | null | undefined : undefined,
    overrideKey: overrideKey(strings.found ? strings.value : undefined),
  });
}

function snapshotLocale(snapshot: SeatLayerPickerSnapshot | undefined): SeatLayerPickerLocale | undefined {
  const event = ownDataProperty(snapshot, 'event');
  return safeLocale(ownDataProperty(event.value, 'locale').value) ?? undefined;
}

function configurationLocale(configuration: SeatLayerConfiguration): SeatLayerPickerLocale | undefined {
  return safeLocale(ownDataProperty(configuration, 'locale').value) ?? undefined;
}

/** Resolves locale in explicit → snapshot → configuration → canonical order. */
export function resolveSeatLayerPickerScopeStringResolution(
  inputs: SeatLayerPickerScopeStringInputs,
  snapshot: SeatLayerPickerSnapshot | undefined,
  configuration: SeatLayerConfiguration,
): SeatLayerPickerScopeStringResolution {
  const locale = inputs.hasExplicitLocale
    ? inputs.locale
    : snapshotLocale(snapshot) ?? configurationLocale(configuration);
  return Object.freeze({ locale, overrides: inputs.overrides, overrideKey: inputs.overrideKey });
}

export function createSeatLayerPickerScopeStrings(
  resolution: SeatLayerPickerScopeStringResolution,
): SeatLayerPickerStringResolver {
  return createSeatLayerPickerStringResolver({ locale: resolution.locale, overrides: resolution.overrides });
}

/** Resolves native wording in explicit → snapshot → configuration → canonical order. */
export function resolveSeatLayerPickerScopeStrings(
  inputs: SeatLayerPickerScopeStringInputs,
  snapshot: SeatLayerPickerSnapshot | undefined,
  configuration: SeatLayerConfiguration,
): SeatLayerPickerStringResolver {
  return createSeatLayerPickerScopeStrings(
    resolveSeatLayerPickerScopeStringResolution(inputs, snapshot, configuration),
  );
}
