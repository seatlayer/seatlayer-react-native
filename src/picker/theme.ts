import type { ImageSourcePropType } from 'react-native';

import {
  resolveSeatLayerPickerLayoutLayers,
  type SeatLayerPickerLayout,
  type SeatLayerPickerLayoutOverrides,
} from './layout';
import { parseSeatLayerPickerColor } from './colors';
import { seatLayerPickerTokens } from './tokens.g';

export type SeatLayerThemeMode = 'auto' | 'light' | 'dark';
export type SeatLayerResolvedThemeMode = Exclude<SeatLayerThemeMode, 'auto'>;
export type SeatLayerPickerBrand = 'default' | (string & {});
export type SeatLayerPickerKnownThemeRole =
  | 'header'
  | 'dockBar'
  | 'sheet'
  | 'primaryAction'
  | 'map'
  | 'notice';
export type SeatLayerPickerThemeRole = SeatLayerPickerKnownThemeRole | (string & {});

export interface SeatLayerPickerColorTokens {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  divider: string;
  error: string;
  warning: string;
  /**
   * The three roles a seat's own notes paint in (§3.8.9).
   *
   * `warning` is the ground a restricted or obstructed view is washed in and
   * `warnText` is the ink ON that wash — a pair, because the wash is a tint of
   * the ground rather than the role colour itself, and reading the ink off
   * `warning` shipped a 1.8:1 amber. `premium` and `premiumText` are the same
   * pair for a premium seat. Host-overridable like every other role; the
   * defaults are the mode's own.
   */
  warnText: string;
  premium: string;
  premiumText: string;
  accent: string;
  onAccent: string;
  mapBackground: string;
  mapRowLabel: string;
  mapText: string;
  mapSelection: string;
}

export interface SeatLayerPickerMapTheme {
  background?: string;
  rowLabelColor?: string;
  textColor?: string;
  selectionColor?: string;
}

export interface SeatLayerPickerResolvedMapTheme {
  background: string;
  rowLabelColor: string;
  textColor: string;
  selectionColor: string;
}

export type SeatLayerPickerLogoInput = ImageSourcePropType | string;

export interface SeatLayerPickerThemeOverrides {
  themeMode?: SeatLayerThemeMode;
  colors?: Partial<SeatLayerPickerColorTokens>;
  layout?: SeatLayerPickerLayoutOverrides;
  radius?: number;
  fontFamily?: string;
  logoSource?: SeatLayerPickerLogoInput;
  mapTheme?: SeatLayerPickerMapTheme;
}

export interface SeatLayerPickerBrandTheme extends SeatLayerPickerThemeOverrides {
  /** A mode to use whenever this brand is selected. */
  themeMode?: SeatLayerThemeMode;
  /** Overrides applied for every mode. */
  colors?: Partial<SeatLayerPickerColorTokens>;
  light?: Partial<SeatLayerPickerColorTokens>;
  dark?: Partial<SeatLayerPickerColorTokens>;
}

export type SeatLayerPickerBrandThemeMap = Readonly<
  Record<string, SeatLayerPickerBrandTheme | undefined>
>;

/** The branding payload supplied by a picker snapshot, kept deliberately sparse. */
export interface SeatLayerPickerOrganizerBranding {
  accent?: string;
  accentInk?: string;
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  line?: string;
  radius?: number;
  fontFamily?: string;
  logoUrl?: string;
}

export interface SeatLayerPickerThemeRoleDefaults {
  background: string;
  foreground: string;
  border: string;
  accent?: string;
  onAccent?: string;
}

export type SeatLayerPickerThemeRoles = Readonly<
  Record<SeatLayerPickerKnownThemeRole, SeatLayerPickerThemeRoleDefaults>
  & Partial<Record<SeatLayerPickerThemeRole, SeatLayerPickerThemeRoleDefaults>>
>;

export interface SeatLayerPickerResolvedRadii {
  base: number;
  button: number;
  card: number;
  chip: number;
  pill: number;
  sheet: number;
}

export interface SeatLayerPickerThemeOptions {
  themeMode?: SeatLayerThemeMode;
  /** Host app preference takes precedence when themeMode is auto. */
  hostThemeMode?: SeatLayerResolvedThemeMode | null;
  /** Device appearance used when no host preference is supplied. */
  systemThemeMode?: SeatLayerResolvedThemeMode | null;
  brand?: SeatLayerPickerBrand;
  brands?: SeatLayerPickerBrandThemeMap;
  /** Explicit host theme values; they win over the selected brand. */
  theme?: SeatLayerPickerThemeOverrides;
  /** Explicit per-call map colours; they win over every authored fallback. */
  mapTheme?: SeatLayerPickerMapTheme;
  /** Branding reported by the current immutable snapshot. */
  organizerBranding?: SeatLayerPickerOrganizerBranding | null;
  /** Explicit host image asset or URI; it wins over theme and organizer logos. */
  logoSource?: SeatLayerPickerLogoInput;
}

export interface SeatLayerPickerThemeData {
  brand: SeatLayerPickerBrand;
  themeMode: SeatLayerResolvedThemeMode;
  colors: Readonly<SeatLayerPickerColorTokens>;
  roles: SeatLayerPickerThemeRoles;
  /** Resolved picker geometry. */
  layout: SeatLayerPickerLayout;
  /** Compatibility alias for older consumers. This is layout by identity. */
  metrics: SeatLayerPickerLayout;
  radii: Readonly<SeatLayerPickerResolvedRadii>;
  radius: number;
  buttonRadius: number;
  elevation: typeof seatLayerPickerTokens.elevation;
  typography: typeof seatLayerPickerTokens.type;
  motion: typeof seatLayerPickerTokens.motion;
  fontFamily?: string;
  logoSource?: ImageSourcePropType;
  mapTheme: Readonly<SeatLayerPickerResolvedMapTheme>;
}


const colorKeys: ReadonlyArray<keyof SeatLayerPickerColorTokens> = [
  'background', 'surface', 'text', 'mutedText', 'divider', 'error', 'warning',
  'warnText', 'premium', 'premiumText',
  'accent', 'onAccent', 'mapBackground', 'mapRowLabel', 'mapText', 'mapSelection',
];
const mapThemeKeys: ReadonlyArray<keyof SeatLayerPickerMapTheme> = [
  'background', 'rowLabelColor', 'textColor', 'selectionColor',
];
const unsafeImageKeys = new Set(['__proto__', 'prototype', 'constructor']);
const invalidImageValue = Symbol('invalid image value');

/** Reads only an enumerable own data property, without invoking a getter. */
function ownDataValue(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    // Theme values cross an untyped JavaScript boundary; hostile proxies are ignored.
    return undefined;
  }
}

function ownObjectValue(source: unknown, key: string): object | undefined {
  const value = ownDataValue(source, key);
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function validResolvedThemeMode(value: unknown): SeatLayerResolvedThemeMode | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

function validThemeMode(value: unknown): SeatLayerThemeMode | undefined {
  return value === 'auto' ? 'auto' : validResolvedThemeMode(value);
}

function firstAuthoredThemeMode(values: ReadonlyArray<unknown>): SeatLayerThemeMode {
  for (const value of values) {
    const mode = validThemeMode(value);
    if (mode) return mode;
  }
  return 'auto';
}

function resolveThemeMode(
  requested: unknown,
  host: unknown,
  system: unknown,
): SeatLayerResolvedThemeMode {
  const explicit = validResolvedThemeMode(requested);
  if (explicit) return explicit;
  return validResolvedThemeMode(host) ?? validResolvedThemeMode(system) ?? 'light';
}

function relativeLuminance({ red, green, blue }: Readonly<{ red: number; green: number; blue: number }>): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function composableSeatLayerPickerColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const source = value.trim();
  const parsed = parseSeatLayerPickerColor(source);
  return parsed !== undefined && parsed.alpha > 0 ? source : undefined;
}

/** Returns the black or white foreground with the higher contrast against an RN colour. */
export function deriveSeatLayerPickerOnAccent(accent: string, fallback: string): string {
  const safeFallback = composableSeatLayerPickerColor(fallback) ?? '#FFFFFF';
  const rgb = parseSeatLayerPickerColor(accent);
  if (!rgb || rgb.alpha <= 0) return safeFallback;
  const luminance = relativeLuminance(rgb);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? '#FFFFFF' : '#000000';
}

function definedColorEntries(source: unknown): Partial<SeatLayerPickerColorTokens> {
  const result: Partial<SeatLayerPickerColorTokens> = {};
  for (const key of colorKeys) {
    const value = ownDataValue(source, key);
    const color = composableSeatLayerPickerColor(value);
    if (color !== undefined) result[key] = color;
  }
  return result;
}

function definedMapEntries(source: unknown): SeatLayerPickerMapTheme {
  const result: SeatLayerPickerMapTheme = {};
  for (const key of mapThemeKeys) {
    const value = ownDataValue(source, key);
    const color = composableSeatLayerPickerColor(value);
    if (color !== undefined) result[key] = color;
  }
  return result;
}

function organizerColors(organizer: unknown): Partial<SeatLayerPickerColorTokens> {
  const result: Partial<SeatLayerPickerColorTokens> = {};
  const sourceKeys: ReadonlyArray<readonly [keyof SeatLayerPickerColorTokens, string]> = [
    ['accent', 'accent'], ['onAccent', 'accentInk'], ['background', 'background'],
    ['surface', 'surface'], ['text', 'text'], ['mutedText', 'muted'], ['divider', 'line'],
  ];
  for (const [target, source] of sourceKeys) {
    const value = ownDataValue(organizer, source);
    const color = composableSeatLayerPickerColor(value);
    if (color !== undefined) result[target] = color;
  }
  return result;
}

function freezeRole(defaults: SeatLayerPickerThemeRoleDefaults): SeatLayerPickerThemeRoleDefaults {
  return Object.freeze(defaults);
}

function roleDefaults(
  colors: Readonly<SeatLayerPickerColorTokens>,
  mapTheme: Readonly<SeatLayerPickerResolvedMapTheme>,
): SeatLayerPickerThemeRoles {
  return Object.freeze({
    // The header sits on the picker's own GROUND: the price rail beneath it is
    // the first surface, and a header painted in the rail's colour makes the
    // two read as one plate with a line through it.
    header: freezeRole({
      background: colors.background,
      foreground: colors.text,
      border: colors.divider,
    }),
    dockBar: freezeRole({
      background: colors.surface,
      foreground: colors.text,
      border: colors.divider,
    }),
    sheet: freezeRole({
      background: colors.surface,
      foreground: colors.text,
      border: colors.divider,
    }),
    primaryAction: freezeRole({
      background: colors.accent,
      foreground: colors.onAccent,
      border: colors.accent,
      accent: colors.accent,
      onAccent: colors.onAccent,
    }),
    map: freezeRole({
      background: mapTheme.background,
      foreground: mapTheme.textColor,
      border: colors.divider,
      accent: mapTheme.selectionColor,
    }),
    notice: freezeRole({
      background: colors.background,
      foreground: colors.mutedText,
      border: colors.divider,
      accent: colors.warning,
    }),
  });
}

function validRadius(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function validFontFamily(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeLogoUri(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = new URL(value);
    const isHttp = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    if (!isHttp || parsed.username || parsed.password) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function cloneFrozenData(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const child of value) copy.push(cloneFrozenData(child, seen));
    return Object.freeze(copy);
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      value: cloneFrozenData(child, seen), enumerable: true, configurable: false, writable: false,
    });
  }
  return Object.freeze(copy);
}

function cloneImageValue(
  value: unknown,
  active = new Set<object>(),
  seen = new Map<object, unknown>(),
): unknown | typeof invalidImageValue {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : invalidImageValue;
  if (typeof value !== 'object') return invalidImageValue;
  if (active.has(value)) return invalidImageValue;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return invalidImageValue;
      const keys = Reflect.ownKeys(value);
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      if (!length || !('value' in length) || !Number.isSafeInteger(length.value) || length.value < 1) {
        return invalidImageValue;
      }
      if (keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^0$|^[1-9]\d*$/.test(key)))) {
        return invalidImageValue;
      }
      if (keys.length !== length.value + 1) return invalidImageValue;
      const copy: unknown[] = [];
      seen.set(value, copy);
      active.add(value);
      for (let index = 0; index < length.value; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !('value' in descriptor)) return invalidImageValue;
        const child = cloneImageValue(descriptor.value, active, seen);
        if (child === invalidImageValue) return invalidImageValue;
        copy.push(child);
      }
      active.delete(value);
      return Object.freeze(copy);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return invalidImageValue;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string' || unsafeImageKeys.has(key))) return invalidImageValue;
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    active.add(value);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) return invalidImageValue;
      const child = cloneImageValue(descriptor.value, active, seen);
      if (child === invalidImageValue) return invalidImageValue;
      Object.defineProperty(copy, key, {
        value: child, enumerable: true, configurable: false, writable: false,
      });
    }
    active.delete(value);
    return Object.freeze(copy);
  } catch {
    return invalidImageValue;
  }
}

function cloneHostLogoSource(value: unknown): ImageSourcePropType | undefined {
  if (typeof value === 'string') {
    return value.trim() ? Object.freeze({ uri: value }) : undefined;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const copy = cloneImageValue(value);
  return copy === invalidImageValue ? undefined : copy as ImageSourcePropType;
}

function organizerLogoSource(value: unknown): ImageSourcePropType | undefined {
  const uri = safeLogoUri(value);
  return uri ? Object.freeze({ uri }) : undefined;
}

function resolveLogoSource(
  options: unknown,
  definition: unknown,
): ImageSourcePropType | undefined {
  const theme = ownObjectValue(options, 'theme');
  const organizer = ownObjectValue(options, 'organizerBranding');
  return cloneHostLogoSource(ownDataValue(options, 'logoSource'))
    ?? cloneHostLogoSource(ownDataValue(theme, 'logoSource'))
    ?? cloneHostLogoSource(ownDataValue(definition, 'logoSource'))
    ?? organizerLogoSource(ownDataValue(organizer, 'logoUrl'));
}

function resolveRadius(
  options: unknown,
  definition: unknown,
): number {
  const theme = ownObjectValue(options, 'theme');
  const organizer = ownObjectValue(options, 'organizerBranding');
  return validRadius(ownDataValue(theme, 'radius'))
    ?? validRadius(ownDataValue(definition, 'radius'))
    ?? validRadius(ownDataValue(organizer, 'radius'))
    ?? seatLayerPickerTokens.radius.base;
}

function resolveFontFamily(
  options: unknown,
  definition: unknown,
): string | undefined {
  const theme = ownObjectValue(options, 'theme');
  const organizer = ownObjectValue(options, 'organizerBranding');
  return validFontFamily(ownDataValue(theme, 'fontFamily'))
    ?? validFontFamily(ownDataValue(definition, 'fontFamily'))
    ?? validFontFamily(ownDataValue(organizer, 'fontFamily'));
}

function resolveMapTheme(
  colors: Readonly<SeatLayerPickerColorTokens>,
  options: unknown,
  definition: unknown,
): Readonly<SeatLayerPickerResolvedMapTheme> {
  const theme = ownObjectValue(options, 'theme');
  const authored = {
    ...definedMapEntries(ownDataValue(definition, 'mapTheme')),
    ...definedMapEntries(ownDataValue(theme, 'mapTheme')),
    ...definedMapEntries(ownDataValue(options, 'mapTheme')),
  };
  return Object.freeze({
    background: authored.background ?? colors.mapBackground,
    rowLabelColor: authored.rowLabelColor ?? colors.mapRowLabel,
    textColor: authored.textColor ?? colors.mapText,
    selectionColor: authored.selectionColor ?? colors.mapSelection,
  });
}

function resolveLayout(
  options: unknown,
  definition: unknown,
): SeatLayerPickerLayout {
  const theme = ownObjectValue(options, 'theme');
  return resolveSeatLayerPickerLayoutLayers([
    ownDataValue(definition, 'layout'),
    ownDataValue(theme, 'layout'),
  ]);
}

interface SeatLayerPickerAuthoredColor {
  index: number;
  value: string;
}

function highestAuthoredColor(
  layers: Array<Partial<SeatLayerPickerColorTokens>>,
  key: 'accent' | 'onAccent',
): SeatLayerPickerAuthoredColor | undefined {
  for (const [index, layer] of layers.entries()) {
    const value = layer[key];
    const color = composableSeatLayerPickerColor(value);
    if (color !== undefined) return { index, value: color };
  }
  return undefined;
}

/** Resolves host, selected brand, organizer, and generated picker visual defaults. */
export function resolveSeatLayerPickerTheme(
  options: SeatLayerPickerThemeOptions = {},
): SeatLayerPickerThemeData {
  const input: unknown = options;
  const brandValue = ownDataValue(input, 'brand');
  const brand = typeof brandValue === 'string' ? brandValue : 'default';
  const definition = brand === 'default'
    ? undefined
    : ownDataValue(ownDataValue(input, 'brands'), brand);
  const theme = ownObjectValue(input, 'theme');
  const organizer = ownObjectValue(input, 'organizerBranding');
  const themeMode = resolveThemeMode(
    firstAuthoredThemeMode([
      ownDataValue(input, 'themeMode'),
      ownDataValue(theme, 'themeMode'),
      ownDataValue(definition, 'themeMode'),
    ]),
    ownDataValue(input, 'hostThemeMode'),
    ownDataValue(input, 'systemThemeMode'),
  );
  const base = seatLayerPickerTokens.color[themeMode];
  const selectedColors = {
    ...definedColorEntries(ownDataValue(definition, 'colors')),
    ...definedColorEntries(ownDataValue(definition, themeMode)),
  };
  const hostColors = definedColorEntries(ownDataValue(theme, 'colors'));
  const organizerColorsLayer = organizerColors(organizer);
  const colorLayers = [hostColors, selectedColors, organizerColorsLayer];
  const authoredAccent = highestAuthoredColor(colorLayers, 'accent');
  const authoredInk = highestAuthoredColor(colorLayers, 'onAccent');
  const accent = authoredAccent?.value ?? base.accent;
  const onAccent = authoredInk !== undefined
    && (authoredAccent === undefined || authoredInk.index <= authoredAccent.index)
    ? authoredInk.value
    : authoredAccent === undefined
      ? base.onAccent
      : deriveSeatLayerPickerOnAccent(accent, base.onAccent);
  // A mode owns the ground and never the brand. The ground roles resolve host,
  // then the selected brand, then the resolved mode's preset, and only then the
  // organizer — so a chart saved against a dark canvas cannot paint the picker's
  // own chips and plates with its map colours. The brand roles (accent, its ink,
  // radius, typeface) skip the preset entirely and are resolved above.
  const colors = Object.freeze({
    ...organizerColorsLayer,
    ...base,
    ...selectedColors,
    ...hostColors,
    accent,
    onAccent,
  }) as Readonly<SeatLayerPickerColorTokens>;
  const radius = resolveRadius(input, definition);
  const layout = resolveLayout(input, definition);
  const mapTheme = resolveMapTheme(colors, input, definition);
  const radii = Object.freeze({
    ...seatLayerPickerTokens.radius,
    base: radius,
    card: radius,
    sheet: radius,
    button: seatLayerPickerTokens.radius.button,
    chip: seatLayerPickerTokens.radius.chip,
    pill: seatLayerPickerTokens.radius.pill,
  });

  return Object.freeze({
    brand,
    themeMode,
    colors,
    roles: roleDefaults(colors, mapTheme),
    layout,
    metrics: layout,
    radii,
    radius,
    buttonRadius: seatLayerPickerTokens.radius.button,
    elevation: cloneFrozenData(seatLayerPickerTokens.elevation) as typeof seatLayerPickerTokens.elevation,
    typography: cloneFrozenData(seatLayerPickerTokens.type) as typeof seatLayerPickerTokens.type,
    motion: cloneFrozenData(seatLayerPickerTokens.motion) as typeof seatLayerPickerTokens.motion,
    fontFamily: resolveFontFamily(input, definition),
    logoSource: resolveLogoSource(input, definition),
    mapTheme,
  });
}
