import { seatLayerPickerTokens } from './tokens.g';

const dark = seatLayerPickerTokens.color.dark;
const size = seatLayerPickerTokens.size;

/**
 * §3.14. ALL 3D chrome wears one dark glass whatever the resolved mode is,
 * because it floats over a rendered venue. This is the shared helper the spec
 * asks for, so no surface re-mixes it.
 */
export interface SeatLayerPickerImmersiveGlass {
  readonly ground: string;
  readonly border: string;
  readonly ink: string;
  readonly blurRadius: number;
}

export const seatLayerPickerImmersiveGlass: SeatLayerPickerImmersiveGlass = Object.freeze({
  ground: dark.immersiveGlass,
  border: dark.immersiveGlassBorder,
  ink: dark.immersiveGlassInk,
  blurRadius: size.immersiveGlassBlur,
});

/** The deeper caption glass, for the chip that names the seat. */
export const seatLayerPickerImmersiveCaptionGlass: SeatLayerPickerImmersiveGlass = Object.freeze({
  ground: dark.immersiveCaption,
  border: dark.immersiveCaptionBorder,
  ink: dark.immersiveCaptionInk,
  blurRadius: size.immersiveCaptionBlur,
});

type BlurComponent = unknown;

let resolvedBlur: BlurComponent | null | undefined;

/**
 * The blur is an OPTIONAL module. React Native has no built-in blur, and this
 * SDK does not make a host install one: where `@react-native-community/blur`
 * is present the glass gets its real backdrop, and where it is not the ground
 * colour alone carries it. Both readings of the glass are legible — the token
 * colours already meet contrast against a rendered venue on their own.
 *
 * Ports note: iOS and Android both have a first-class blur, so a Swift or
 * Compose port should draw the real thing rather than reproducing this
 * fallback.
 */
export function seatLayerPickerImmersiveBlurComponent(): BlurComponent | undefined {
  if (resolvedBlur !== undefined) return resolvedBlur ?? undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = (globalThis as { require?: (id: string) => unknown }).require?.(
      '@react-native-community/blur',
    ) as { BlurView?: unknown } | undefined;
    resolvedBlur = module?.BlurView ?? null;
  } catch {
    resolvedBlur = null;
  }
  return resolvedBlur ?? undefined;
}

/** @internal Test seam: forget a previously resolved blur module. */
export function resetSeatLayerPickerImmersiveBlur(): void {
  resolvedBlur = undefined;
}

/** Whether the glass can draw its real backdrop on this device. */
export function seatLayerPickerImmersiveBlurAvailable(): boolean {
  return seatLayerPickerImmersiveBlurComponent() !== undefined;
}
