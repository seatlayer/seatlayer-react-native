import { SeatLayerError } from '../errors';
import type { SeatLayerPickerMapTheme } from './theme';

export function validateNonEmpty(
  name: string,
  value: unknown,
): SeatLayerError | undefined {
  return typeof value === 'string' && value.trim()
    ? undefined
    : new SeatLayerError('bad_payload', `SeatLayer ${name} is required.`);
}

export function validatePositiveInteger(
  name: string,
  value: unknown,
): SeatLayerError | undefined {
  return Number.isInteger(value) && (value as number) > 0
    ? undefined
    : new SeatLayerError(
      'bad_payload',
      `SeatLayer ${name} must be a positive integer.`,
    );
}

export function validateBoolean(
  name: string,
  value: unknown,
): SeatLayerError | undefined {
  return typeof value === 'boolean'
    ? undefined
    : new SeatLayerError('bad_payload', `SeatLayer ${name} must be a boolean.`);
}

export function validateOptions(value: unknown): SeatLayerError | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? undefined
    : new SeatLayerError('bad_payload', 'SeatLayer options must be an object.');
}

export function validateStrings(
  name: string,
  values: unknown,
): SeatLayerError | undefined {
  return Array.isArray(values) &&
      values.every((value) => typeof value === 'string' && value.trim())
    ? undefined
    : new SeatLayerError(
      'bad_payload',
      `SeatLayer ${name} must contain non-empty strings.`,
    );
}

export function validateViewportInsets(
  value: unknown,
): SeatLayerError | undefined {
  if (value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return new SeatLayerError(
      'bad_payload',
      'SeatLayer viewport insets must be an object.',
    );
  }
  const insets = value as Record<string, unknown>;
  return ['top', 'right', 'bottom', 'left'].every(
      (side) => typeof insets[side] === 'number',
    )
    ? undefined
    : new SeatLayerError(
      'bad_payload',
      'SeatLayer viewport insets require numeric sides.',
    );
}

const mapThemeKeys = new Set<keyof SeatLayerPickerMapTheme>([
  'background',
  'rowLabelColor',
  'textColor',
  'selectionColor',
]);

const hexColor = /^#[0-9a-fA-F]{6}$/;

export function validateMapTheme(value: unknown): SeatLayerError | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return new SeatLayerError(
      'bad_payload',
      'SeatLayer mapTheme must be an object or null.',
    );
  }
  for (const [key, color] of Object.entries(value)) {
    if (!mapThemeKeys.has(key as keyof SeatLayerPickerMapTheme)) {
      return new SeatLayerError(
        'bad_payload',
        `SeatLayer mapTheme key '${key}' is not supported.`,
      );
    }
    if (typeof color !== 'string' || !hexColor.test(color)) {
      return new SeatLayerError(
        'bad_payload',
        `SeatLayer mapTheme '${key}' must be a six-digit hex color.`,
      );
    }
  }
  return undefined;
}
