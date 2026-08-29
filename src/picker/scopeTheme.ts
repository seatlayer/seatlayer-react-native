import type { SeatLayerPickerSnapshot } from './models';
import {
  resolveSeatLayerPickerTheme,
  type SeatLayerPickerThemeData,
  type SeatLayerPickerThemeOptions,
  type SeatLayerThemeMode,
} from './theme';

function ownData(options: unknown, key: string): { readonly present: boolean; readonly value: unknown } {
  if (!options || typeof options !== 'object') return { present: false, value: undefined };
  try {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    return descriptor !== undefined && 'value' in descriptor
      ? { present: true, value: descriptor.value }
      : { present: false, value: undefined };
  } catch {
    return { present: false, value: undefined };
  }
}

function composeScopeThemeOptions(
  options: Omit<SeatLayerPickerThemeOptions, 'themeMode' | 'systemThemeMode'> | undefined,
  themeMode: SeatLayerThemeMode,
  systemThemeMode: 'light' | 'dark',
  snapshot: SeatLayerPickerSnapshot | undefined,
): SeatLayerPickerThemeOptions {
  const output: Record<string, unknown> = { themeMode, systemThemeMode };
  for (const key of ['hostThemeMode', 'brand', 'brands', 'theme', 'mapTheme', 'logoSource']) {
    const value = ownData(options, key);
    if (value.present) Object.defineProperty(output, key, { value: value.value, enumerable: true });
  }
  const organizer = ownData(options, 'organizerBranding');
  Object.defineProperty(output, 'organizerBranding', {
    value: organizer.present ? organizer.value : snapshot?.branding,
    enumerable: true,
  });
  return output as SeatLayerPickerThemeOptions;
}

/** Resolves live organizer branding from the one immutable picker snapshot. */
export function resolveSeatLayerPickerScopeTheme(
  themeOptions: Omit<SeatLayerPickerThemeOptions, 'themeMode' | 'systemThemeMode'> | undefined,
  themeMode: SeatLayerThemeMode,
  systemThemeMode: 'light' | 'dark',
  snapshot: SeatLayerPickerSnapshot | undefined,
): SeatLayerPickerThemeData {
  return resolveSeatLayerPickerTheme(
    composeScopeThemeOptions(themeOptions, themeMode, systemThemeMode, snapshot),
  );
}
