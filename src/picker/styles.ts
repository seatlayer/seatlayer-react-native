import { StyleSheet, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { parseSeatLayerPickerColor } from './colors';

/**
 * Standalone picker chrome slots. A slot's type intentionally restricts it to
 * the React Native element it decorates, rather than accepting a string map.
 */
export interface SeatLayerPickerStyles {
  headerContainer?: StyleProp<ViewStyle>;
  headerTitle?: StyleProp<TextStyle>;
  headerLogo?: StyleProp<ImageStyle>;
  headerFallbackMark?: StyleProp<ViewStyle>;
  headerAction?: StyleProp<ViewStyle>;
  holdPillContainer?: StyleProp<ViewStyle>;
  holdPillText?: StyleProp<TextStyle>;
  legendContainer?: StyleProp<ViewStyle>;
  legendChipContainer?: StyleProp<ViewStyle>;
  legendChipText?: StyleProp<TextStyle>;
  dockContainer?: StyleProp<ViewStyle>;
  dockSectionText?: StyleProp<TextStyle>;
  dockCountText?: StyleProp<TextStyle>;
  confirmCardContainer?: StyleProp<ViewStyle>;
  confirmCardIdentityText?: StyleProp<TextStyle>;
  confirmCardPhoto?: StyleProp<ImageStyle>;
  confirmCardPrimaryButton?: StyleProp<ViewStyle>;
  confirmCardPrimaryButtonText?: StyleProp<TextStyle>;
  confirmCardSecondaryButton?: StyleProp<ViewStyle>;
  confirmCardSecondaryButtonText?: StyleProp<TextStyle>;
  sheetContainer?: StyleProp<ViewStyle>;
  peekContainer?: StyleProp<ViewStyle>;
  peekSummaryText?: StyleProp<TextStyle>;
  continueButton?: StyleProp<ViewStyle>;
  continueButtonText?: StyleProp<TextStyle>;
  denseLineContainer?: StyleProp<ViewStyle>;
  denseLineText?: StyleProp<TextStyle>;
  denseLineRemoveButton?: StyleProp<ViewStyle>;
  denseLineRemoveButtonText?: StyleProp<TextStyle>;
  bestSeatsContainer?: StyleProp<ViewStyle>;
  bestSeatsSelector?: StyleProp<ViewStyle>;
  bestSeatsButton?: StyleProp<ViewStyle>;
  bestSeatsButtonText?: StyleProp<TextStyle>;
  mapControlsContainer?: StyleProp<ViewStyle>;
  mapControlButton?: StyleProp<ViewStyle>;
  mapControlLabel?: StyleProp<TextStyle>;
  accessibilityControlsContainer?: StyleProp<ViewStyle>;
  accessibilityControlButton?: StyleProp<ViewStyle>;
  accessibilityControlLabel?: StyleProp<TextStyle>;
  accessibilityModalContainer?: StyleProp<ViewStyle>;
  accessibilityNeedButton?: StyleProp<ViewStyle>;
  accessibilityNeedText?: StyleProp<TextStyle>;
  accessibilityAction?: StyleProp<ViewStyle>;
  accessibilityActionText?: StyleProp<TextStyle>;
  floorStripContainer?: StyleProp<ViewStyle>;
  floorChip?: StyleProp<ViewStyle>;
  floorChipText?: StyleProp<TextStyle>;
  immersiveChromeContainer?: StyleProp<ViewStyle>;
  immersiveChromeButton?: StyleProp<ViewStyle>;
  immersiveChromeButtonText?: StyleProp<TextStyle>;
  seatViewChromeContainer?: StyleProp<ViewStyle>;
  seatViewChromeButton?: StyleProp<ViewStyle>;
  seatViewChromeButtonText?: StyleProp<TextStyle>;
  statusContainer?: StyleProp<ViewStyle>;
  statusText?: StyleProp<TextStyle>;
  statusAction?: StyleProp<ViewStyle>;
  statusActionText?: StyleProp<TextStyle>;
  errorContainer?: StyleProp<ViewStyle>;
  errorText?: StyleProp<TextStyle>;
  attributionContainer?: StyleProp<ViewStyle>;
  attributionText?: StyleProp<TextStyle>;
  attributionMark?: StyleProp<ViewStyle>;
}

export type SeatLayerPickerThemeStyles = Readonly<SeatLayerPickerStyles>;
export type SeatLayerPickerComponentStyles = Readonly<SeatLayerPickerStyles>;

const styleSlotKeys: readonly (keyof SeatLayerPickerStyles)[] = Object.freeze([
  "headerContainer", "headerTitle", "headerLogo", "headerFallbackMark",
  "headerAction", "holdPillContainer", "holdPillText", "legendContainer",
  "legendChipContainer", "legendChipText", "dockContainer", "dockSectionText",
  "dockCountText", "confirmCardContainer", "confirmCardIdentityText",
  "confirmCardPhoto", "confirmCardPrimaryButton", "confirmCardPrimaryButtonText",
  "confirmCardSecondaryButton", "confirmCardSecondaryButtonText", "sheetContainer",
  "peekContainer", "peekSummaryText", "continueButton", "continueButtonText",
  "denseLineContainer", "denseLineText", "denseLineRemoveButton",
  "denseLineRemoveButtonText", "bestSeatsContainer", "bestSeatsSelector",
  "bestSeatsButton", "bestSeatsButtonText", "mapControlsContainer",
  "mapControlButton", "mapControlLabel", "accessibilityControlsContainer",
  "accessibilityControlButton", "accessibilityControlLabel", "accessibilityModalContainer",
  "accessibilityNeedButton", "accessibilityNeedText", "accessibilityAction",
  "accessibilityActionText", "floorStripContainer", "floorChip", "floorChipText",
  "immersiveChromeContainer", "immersiveChromeButton", "immersiveChromeButtonText",
  "seatViewChromeContainer", "seatViewChromeButton", "seatViewChromeButtonText",
  "statusContainer", "statusText", "statusAction", "statusActionText",
  "errorContainer", "errorText", "attributionContainer", "attributionText",
  "attributionMark",
]);

// Layout and ownership are SDK invariants. These are intentionally visual-only
// keys; an inherited value or a getter is never evaluated.
const safeViewKeys = new Set([
  'backgroundColor', 'borderColor', 'borderWidth', 'borderTopColor',
  'borderBottomColor', 'borderStartColor', 'borderEndColor', 'shadowColor',
  'shadowOpacity', 'shadowRadius', 'shadowOffset', 'elevation', 'opacity',
  'tintColor', 'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
]);
const safeTextKeys = new Set([
  ...safeViewKeys, 'color', 'fontFamily', 'fontSize', 'fontStyle',
  'fontWeight', 'fontVariant', 'letterSpacing', 'lineHeight',
  'textDecorationColor', 'textDecorationLine', 'textDecorationStyle',
  'textShadowColor', 'textShadowOffset', 'textShadowRadius',
]);
const textSlots = new Set<keyof SeatLayerPickerStyles>([
  'headerTitle', 'holdPillText', 'legendChipText', 'dockSectionText', 'dockCountText',
  'confirmCardIdentityText', 'confirmCardPrimaryButtonText', 'confirmCardSecondaryButtonText',
  'peekSummaryText', 'continueButtonText', 'denseLineText', 'denseLineRemoveButtonText',
  'bestSeatsButtonText', 'mapControlLabel', 'accessibilityControlLabel',
  'accessibilityNeedText', 'accessibilityActionText', 'floorChipText',
  'immersiveChromeButtonText', 'seatViewChromeButtonText', 'statusText',
  'statusActionText', 'errorText', 'attributionText',
]);

function boundedNumber(value: unknown, low: number, high: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : undefined;
}

function safeOffset(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const output: Record<string, number> = Object.create(null);
  try {
    for (const key of ['width', 'height']) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const number = descriptor && 'value' in descriptor
        ? boundedNumber(descriptor.value, -32, 32) : undefined;
      if (number !== undefined) output[key] = number;
    }
  } catch { return undefined; }
  return Object.keys(output).length ? Object.freeze(output) : undefined;
}

function aestheticStyle(value: unknown, text = false): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze(Object.create(null));
  }
  const result: Record<string, unknown> = Object.create(null);
  const keys = text ? safeTextKeys : safeViewKeys;
  try {
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) continue;
      if (key === 'shadowOffset' || key === 'textShadowOffset') {
        const offset = safeOffset(descriptor.value);
        if (offset) result[key] = offset;
        continue;
      }
      if (key === 'opacity' || key === 'shadowOpacity') {
        const number = boundedNumber(descriptor.value, 0, 1);
        if (number !== undefined) result[key] = number;
        continue;
      }
      if (key === 'borderWidth') {
        const number = boundedNumber(descriptor.value, 0, 4);
        if (number !== undefined) result[key] = number;
        continue;
      }
      if (key.includes('Radius')) {
        const number = boundedNumber(descriptor.value, 0, 24);
        if (number !== undefined) result[key] = number;
        continue;
      }
      if (key === 'shadowRadius' || key === 'textShadowRadius' || key === 'elevation') {
        const number = boundedNumber(descriptor.value, 0, 24);
        if (number !== undefined) result[key] = number;
        continue;
      }
      if (key === 'fontSize' || key === 'lineHeight') {
        const number = boundedNumber(descriptor.value, 8, 32);
        if (number !== undefined) result[key] = number;
        continue;
      }
      if (key === 'letterSpacing') {
        const number = boundedNumber(descriptor.value, -1, 4);
        if (number !== undefined) result[key] = number;
        continue;
      }
      const safeValue = safeAestheticValue(key, descriptor.value);
      if (safeValue !== undefined) result[key] = safeValue;
    }
  } catch { return Object.freeze(Object.create(null)); }
  return Object.freeze(result);
}

function safeAestheticValue(key: string, value: unknown): unknown {
  if (key === 'fontWeight') {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value >= 100 && value <= 900 && value % 100 === 0
        ? value : undefined;
    }
    return typeof value === 'string' && new Set([
      'normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900',
    ]).has(value) ? value : undefined;
  }
  if (key === 'fontVariant') {
    return safeStringArray(value);
  }
  if (typeof value !== 'string' || !value.trim() || value.length > 256) return undefined;
  if (key === 'color' || key.endsWith('Color') || key === 'tintColor') {
    return value.trim().toLowerCase() === 'transparent' || parseSeatLayerPickerColor(value) !== undefined
      ? value.trim()
      : undefined;
  }
  if (key === 'fontStyle') return value === 'normal' || value === 'italic' ? value : undefined;
  if (key === 'textDecorationLine') {
    return new Set(['none', 'underline', 'line-through', 'underline line-through']).has(value)
      ? value : undefined;
  }
  if (key === 'textDecorationStyle') {
    return new Set(['solid', 'double', 'dotted', 'dashed']).has(value) ? value : undefined;
  }
  return value;
}

function safeStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  try {
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length > 16) return undefined;
    const output: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string' ||
        !new Set([
          'small-caps', 'oldstyle-nums', 'lining-nums', 'tabular-nums',
          'proportional-nums', 'common-ligatures', 'no-common-ligatures',
          'discretionary-ligatures', 'no-discretionary-ligatures',
        ]).has(descriptor.value)) return undefined;
      output.push(descriptor.value);
    }
    return Object.freeze(output);
  } catch { return undefined; }
}

/** Removes layout, hit-target, positioning and ownership overrides from host styles. */
export function sanitizeSeatLayerPickerStyle<Style extends ViewStyle | TextStyle | ImageStyle>(
  value: StyleProp<Style> | undefined,
  text = false,
): StyleProp<Style> | undefined {
  if (value === undefined) return undefined;
  const output: Record<string, unknown> = Object.create(null);
  const visited = new WeakSet<object>();
  const collect = (input: unknown, depth = 0): void => {
    if (!input) return;
    if (depth > 24) return;
    if (Array.isArray(input)) {
      if (visited.has(input)) return;
      visited.add(input);
      collectArrayData(input, (entry) => collect(entry, depth + 1));
      return;
    }
    if (typeof input === 'number') {
      try {
        const flattened = StyleSheet.flatten(input);
        if (flattened !== input) collect(flattened, depth + 1);
      } catch { /* Unknown registered style. */ }
      return;
    }
    Object.assign(output, aestheticStyle(input, text));
  };
  collect(value);
  return Object.freeze(output) as Style;
}

/** Reads nested RN style arrays without invoking an iterator or accessor. */
function collectArrayData(input: object, collect: (entry: unknown) => void): void {
  try {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
    const length = lengthDescriptor && 'value' in lengthDescriptor &&
      typeof lengthDescriptor.value === 'number' && Number.isSafeInteger(lengthDescriptor.value)
      ? Math.min(128, Math.max(0, lengthDescriptor.value))
      : 0;
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (descriptor && 'value' in descriptor) collect(descriptor.value);
    }
  } catch { /* Throwing proxy style arrays are ignored. */ }
}

/** Copies only known own data slots: inherited values and getters never run. */
function safeStyleBag(value: unknown): SeatLayerPickerStyles {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return Object.freeze(Object.create(null)) as SeatLayerPickerStyles;
  }
  const copy = Object.create(null) as Record<string, unknown>;
  try {
    for (const key of styleSlotKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable && "value" in descriptor) {
        const text = textSlots.has(key);
        Object.defineProperty(copy, key, {
          value: sanitizeSeatLayerPickerStyle(descriptor.value as StyleProp<ViewStyle>, text),
          enumerable: true,
          configurable: false,
          writable: false,
        });
      }
    }
  } catch {
    return Object.freeze(Object.create(null)) as SeatLayerPickerStyles;
  }
  return Object.freeze(copy) as SeatLayerPickerStyles;
}

function mergeStyle<Style extends ViewStyle | TextStyle | ImageStyle>(
  themeStyle: StyleProp<Style> | undefined,
  componentStyle: StyleProp<Style> | undefined,
): StyleProp<Style> | undefined {
  if (themeStyle === undefined) return componentStyle;
  if (componentStyle === undefined) return themeStyle;
  return Object.freeze([themeStyle, componentStyle]) as StyleProp<Style>;
}

/** Fixed outer hit geometry applied after host aesthetics by chip controls. */
export function seatLayerPickerMinimumTargetStyle(target: number): Readonly<{
  alignItems: 'center';
  justifyContent: 'center';
  minWidth: number;
}> {
  const size = Number.isFinite(target) ? Math.max(44, Math.min(4096, target)) : 44;
  return Object.freeze({ alignItems: 'center', justifyContent: 'center', minWidth: size });
}

/**
 * Merges theme-level chrome styles with component-local styles. React Native
 * resolves the returned arrays from left to right, so component styles win.
 */
export function resolveSeatLayerPickerStyles(
  themeStylesInput: SeatLayerPickerThemeStyles = {},
  componentStylesInput: SeatLayerPickerComponentStyles = {},
): SeatLayerPickerStyles {
  const themeStyles = safeStyleBag(themeStylesInput);
  const componentStyles = safeStyleBag(componentStylesInput);
  return Object.freeze({
    headerContainer: mergeStyle(themeStyles.headerContainer, componentStyles.headerContainer),
    headerTitle: mergeStyle(themeStyles.headerTitle, componentStyles.headerTitle),
    headerLogo: mergeStyle(themeStyles.headerLogo, componentStyles.headerLogo),
    headerFallbackMark: mergeStyle(themeStyles.headerFallbackMark, componentStyles.headerFallbackMark),
    headerAction: mergeStyle(themeStyles.headerAction, componentStyles.headerAction),
    holdPillContainer: mergeStyle(themeStyles.holdPillContainer, componentStyles.holdPillContainer),
    holdPillText: mergeStyle(themeStyles.holdPillText, componentStyles.holdPillText),
    legendContainer: mergeStyle(themeStyles.legendContainer, componentStyles.legendContainer),
    legendChipContainer: mergeStyle(themeStyles.legendChipContainer, componentStyles.legendChipContainer),
    legendChipText: mergeStyle(themeStyles.legendChipText, componentStyles.legendChipText),
    dockContainer: mergeStyle(themeStyles.dockContainer, componentStyles.dockContainer),
    dockSectionText: mergeStyle(themeStyles.dockSectionText, componentStyles.dockSectionText),
    dockCountText: mergeStyle(themeStyles.dockCountText, componentStyles.dockCountText),
    confirmCardContainer: mergeStyle(themeStyles.confirmCardContainer, componentStyles.confirmCardContainer),
    confirmCardIdentityText: mergeStyle(themeStyles.confirmCardIdentityText, componentStyles.confirmCardIdentityText),
    confirmCardPhoto: mergeStyle(themeStyles.confirmCardPhoto, componentStyles.confirmCardPhoto),
    confirmCardPrimaryButton: mergeStyle(
      themeStyles.confirmCardPrimaryButton, componentStyles.confirmCardPrimaryButton),
    confirmCardPrimaryButtonText: mergeStyle(
      themeStyles.confirmCardPrimaryButtonText, componentStyles.confirmCardPrimaryButtonText),
    confirmCardSecondaryButton: mergeStyle(
      themeStyles.confirmCardSecondaryButton, componentStyles.confirmCardSecondaryButton),
    confirmCardSecondaryButtonText: mergeStyle(
      themeStyles.confirmCardSecondaryButtonText, componentStyles.confirmCardSecondaryButtonText),
    sheetContainer: mergeStyle(themeStyles.sheetContainer, componentStyles.sheetContainer),
    peekContainer: mergeStyle(themeStyles.peekContainer, componentStyles.peekContainer),
    peekSummaryText: mergeStyle(themeStyles.peekSummaryText, componentStyles.peekSummaryText),
    continueButton: mergeStyle(themeStyles.continueButton, componentStyles.continueButton),
    continueButtonText: mergeStyle(themeStyles.continueButtonText, componentStyles.continueButtonText),
    denseLineContainer: mergeStyle(themeStyles.denseLineContainer, componentStyles.denseLineContainer),
    denseLineText: mergeStyle(themeStyles.denseLineText, componentStyles.denseLineText),
    denseLineRemoveButton: mergeStyle(themeStyles.denseLineRemoveButton, componentStyles.denseLineRemoveButton),
    denseLineRemoveButtonText: mergeStyle(
      themeStyles.denseLineRemoveButtonText, componentStyles.denseLineRemoveButtonText),
    bestSeatsContainer: mergeStyle(themeStyles.bestSeatsContainer, componentStyles.bestSeatsContainer),
    bestSeatsSelector: mergeStyle(themeStyles.bestSeatsSelector, componentStyles.bestSeatsSelector),
    bestSeatsButton: mergeStyle(themeStyles.bestSeatsButton, componentStyles.bestSeatsButton),
    bestSeatsButtonText: mergeStyle(themeStyles.bestSeatsButtonText, componentStyles.bestSeatsButtonText),
    mapControlsContainer: mergeStyle(themeStyles.mapControlsContainer, componentStyles.mapControlsContainer),
    mapControlButton: mergeStyle(themeStyles.mapControlButton, componentStyles.mapControlButton),
    mapControlLabel: mergeStyle(themeStyles.mapControlLabel, componentStyles.mapControlLabel),
    accessibilityControlsContainer: mergeStyle(
      themeStyles.accessibilityControlsContainer, componentStyles.accessibilityControlsContainer),
    accessibilityControlButton: mergeStyle(
      themeStyles.accessibilityControlButton, componentStyles.accessibilityControlButton),
    accessibilityControlLabel: mergeStyle(
      themeStyles.accessibilityControlLabel, componentStyles.accessibilityControlLabel),
    accessibilityModalContainer: mergeStyle(
      themeStyles.accessibilityModalContainer, componentStyles.accessibilityModalContainer),
    accessibilityNeedButton: mergeStyle(themeStyles.accessibilityNeedButton, componentStyles.accessibilityNeedButton),
    accessibilityNeedText: mergeStyle(themeStyles.accessibilityNeedText, componentStyles.accessibilityNeedText),
    accessibilityAction: mergeStyle(themeStyles.accessibilityAction, componentStyles.accessibilityAction),
    accessibilityActionText: mergeStyle(themeStyles.accessibilityActionText, componentStyles.accessibilityActionText),
    floorStripContainer: mergeStyle(themeStyles.floorStripContainer, componentStyles.floorStripContainer),
    floorChip: mergeStyle(themeStyles.floorChip, componentStyles.floorChip),
    floorChipText: mergeStyle(themeStyles.floorChipText, componentStyles.floorChipText),
    immersiveChromeContainer: mergeStyle(
      themeStyles.immersiveChromeContainer, componentStyles.immersiveChromeContainer),
    immersiveChromeButton: mergeStyle(themeStyles.immersiveChromeButton, componentStyles.immersiveChromeButton),
    immersiveChromeButtonText: mergeStyle(
      themeStyles.immersiveChromeButtonText, componentStyles.immersiveChromeButtonText),
    seatViewChromeContainer: mergeStyle(themeStyles.seatViewChromeContainer, componentStyles.seatViewChromeContainer),
    seatViewChromeButton: mergeStyle(themeStyles.seatViewChromeButton, componentStyles.seatViewChromeButton),
    seatViewChromeButtonText: mergeStyle(
      themeStyles.seatViewChromeButtonText, componentStyles.seatViewChromeButtonText),
    statusContainer: mergeStyle(themeStyles.statusContainer, componentStyles.statusContainer),
    statusText: mergeStyle(themeStyles.statusText, componentStyles.statusText),
    statusAction: mergeStyle(themeStyles.statusAction, componentStyles.statusAction),
    statusActionText: mergeStyle(themeStyles.statusActionText, componentStyles.statusActionText),
    errorContainer: mergeStyle(themeStyles.errorContainer, componentStyles.errorContainer),
    errorText: mergeStyle(themeStyles.errorText, componentStyles.errorText),
    attributionContainer: mergeStyle(themeStyles.attributionContainer, componentStyles.attributionContainer),
    attributionText: mergeStyle(themeStyles.attributionText, componentStyles.attributionText),
    attributionMark: mergeStyle(themeStyles.attributionMark, componentStyles.attributionMark),
  });
}
