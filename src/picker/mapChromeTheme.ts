import type { SeatLayerPickerSnapshot } from "./models";
import type {
  SeatLayerPickerThemeData,
  SeatLayerPickerThemeRoleDefaults,
} from "./theme";
import { seatLayerPickerTokens } from "./tokens.g";
import { seatLayerPickerColorAlpha as colorAlpha } from './colors';

function groundRole(
  current: SeatLayerPickerThemeRoleDefaults | undefined,
  background: string,
  foreground: string,
  border: string,
): SeatLayerPickerThemeRoleDefaults {
  return Object.freeze({
    ...current,
    background,
    foreground,
    border,
  });
}

/** Uses immersive dark chrome while retaining the authored brand accent. */
export function resolveSeatLayerPickerMapChromeTheme(
  theme: SeatLayerPickerThemeData,
  snapshot: SeatLayerPickerSnapshot | undefined,
): SeatLayerPickerThemeData {
  if (snapshot?.map.buyerView !== "venue3d") return theme;
  const ground = seatLayerPickerTokens.color.dark;
  const roles = Object.freeze({
    ...theme.roles,
    header: groundRole(
      theme.roles.header,
      ground.surface,
      ground.text,
      ground.divider,
    ),
    dockBar: groundRole(
      theme.roles.dockBar,
      ground.surface,
      ground.text,
      ground.divider,
    ),
    sheet: groundRole(
      theme.roles.sheet,
      ground.surface,
      ground.text,
      ground.divider,
    ),
    notice: groundRole(
      theme.roles.notice,
      ground.background,
      ground.mutedText,
      ground.divider,
    ),
  });
  return Object.freeze({
    ...theme,
    themeMode: "dark",
    roles,
    colors: Object.freeze({
      ...theme.colors,
      background: ground.background,
      surface: ground.surface,
      text: ground.text,
      mutedText: ground.mutedText,
      divider: ground.divider,
      error: ground.error,
      mapBackground: ground.mapBackground,
      mapRowLabel: ground.mapRowLabel,
      mapSelection: ground.mapSelection,
      mapText: ground.mapText,
    }),
  });
}

/** Converts a valid CSS colour to an alpha overlay without an opaque fallback. */
export function seatLayerPickerColorAlpha(
  color: string,
  opacity: number,
): string {
  return colorAlpha(color, opacity);
}
