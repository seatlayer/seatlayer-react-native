import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import {
  seatLayerPickerSeatGlyphs, seatLayerPickerSeatIconStrokeWidth, seatLayerPickerSeatIconViewBox,
  type SeatLayerPickerSeatGlyph,
} from './seatIconGlyphs';
import { seatLayerPickerSeatIconMasks } from './seatIconMasks.g';

export {
  seatLayerPickerSeatGlyphs, seatLayerPickerSeatIconStrokeWidth, seatLayerPickerSeatIconViewBox,
  type SeatLayerPickerSeatGlyph,
};

/**
 * §3.8.9 — ONE drawing per seat attribute, shared with every other surface.
 *
 * The picker names twelve accommodations, three selling marks and the
 * organizer's own note. Every surface that mentioned any of them used to draw
 * it with whatever emoji or platform icon came closest, so the same seat wore
 * a different mark on the map, the tap card, the confirm card and the cart.
 *
 * The geometry (seatIconGlyphs.ts) is transcribed VERBATIM from the runtime's shared set
 * (`core/render-assets/seatTypeIcons.ts`) by way of the reference port
 * (`lib/src/picker/picker_seat_icons.dart`), which is why the box is 20 rather
 * than 24 and why every glyph is stroke-only: a row's tone is one colour away,
 * with no second icon set to keep in step. **No emoji and no platform icon** —
 * an emoji arrives in a colour, weight and baseline the host font decides.
 * A key this build does not know draws nothing rather than a broken box.
 *
 * **What is RN-specific.** This package takes no MANDATORY drawing dependency:
 * `react-native-svg` is an optional peer, and a bundler resolves a `require`
 * statically, so a guarded import here would put it in every consumer's build
 * graph. With nothing installed the glyph is a PNG mask drawn from the same path
 * data (seatIconMasks.g.ts) in the row's ink, and a host that HAS a vector
 * renderer installs it through {@link installSeatLayerPickerSvgIcons} or
 * {@link setSeatLayerPickerSeatIconRenderer} and gets it drawn natively. The
 * path data — not the renderer — is the contract a Swift or Compose port
 * transcribes.
 */

/** Whether this build has a drawing for [key] at all. */
export function seatLayerPickerHasSeatIcon(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(seatLayerPickerSeatGlyphs, key);
}

/**
 * The glyph [key] names as standalone SVG markup in [color], or `undefined`
 * where this build has no drawing for it.
 *
 * Pure, and exported, so a test can read the transcription without rendering.
 */
export function seatLayerPickerSeatIconSvg(
  key: string,
  color: string,
  size: number = seatLayerPickerSeatIconViewBox,
): string | undefined {
  if (!seatLayerPickerHasSeatIcon(key)) return undefined;
  const glyph = seatLayerPickerSeatGlyphs[key] as SeatLayerPickerSeatGlyph;
  const ink = escapeXml(color);
  const box = seatLayerPickerSeatIconViewBox;
  const parts: string[] = [];
  for (const circle of glyph.circles ?? []) {
    parts.push(`<circle cx="${circle[0]}" cy="${circle[1]}" r="${circle[2]}"/>`);
  }
  for (const data of glyph.paths ?? []) parts.push(`<path d="${escapeXml(data)}"/>`);
  for (const data of glyph.fills ?? []) {
    parts.push(`<path d="${escapeXml(data)}" fill="${ink}" stroke="none"/>`);
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" ' +
    `width="${size}" height="${size}" viewBox="0 0 ${box} ${box}" ` +
    `fill="none" stroke="${ink}" stroke-width="${seatLayerPickerSeatIconStrokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</svg>`;
}

/** The glyph's mask as an image source, for the default renderer. */
export function seatLayerPickerSeatIconSource(key: string): Readonly<{ uri: string }> | undefined {
  return seatLayerPickerHasSeatIcon(key)
    ? { uri: `data:image/png;base64,${seatLayerPickerSeatIconMasks[key]}` }
    : undefined;
}

export interface SeatLayerPickerSeatIconProps {
  /** The runtime's own key — an accessibility value or a commercial mark. */
  readonly iconKey: string;
  /** The row's ink; the glyph inherits it rather than carrying a colour. */
  readonly color: string;
  readonly size?: number;
  readonly style?: StyleProp<ImageStyle>;
}

export type SeatLayerPickerSeatIconRenderer =
  React.ComponentType<SeatLayerPickerSeatIconProps>;

let installedRenderer: SeatLayerPickerSeatIconRenderer | undefined;

/**
 * Installs (or clears, with `undefined`) a vector renderer for the glyphs.
 *
 * A host with `react-native-svg` passes a component that reads
 * {@link seatLayerPickerSeatGlyphs} and draws the same paths natively. Without
 * one the glyph is a PNG mask, sharp up to the sizes the picker draws.
 */
export function setSeatLayerPickerSeatIconRenderer(
  renderer: SeatLayerPickerSeatIconRenderer | undefined,
): void {
  installedRenderer = renderer;
}

/** What the icon would be drawn with, if anything is installed. */
export function seatLayerPickerSeatIconRenderer(): SeatLayerPickerSeatIconRenderer | undefined {
  return installedRenderer;
}

/** One attribute's drawing, in the ink the row hands it. */
export function SeatLayerPickerSeatIcon(
  props: SeatLayerPickerSeatIconProps,
): React.ReactElement | null {
  const size = props.size ?? seatLayerPickerSeatIconViewBox;
  if (!seatLayerPickerHasSeatIcon(props.iconKey)) return null;
  const Renderer = installedRenderer;
  if (Renderer !== undefined) return <Renderer {...props} size={size} />;
  const source = seatLayerPickerSeatIconSource(props.iconKey);
  if (source === undefined) return null;
  return <Image
    accessibilityElementsHidden
    fadeDuration={0}
    importantForAccessibility="no-hide-descendants"
    source={source}
    style={[{ height: size, tintColor: props.color, width: size }, props.style]}
    testID={`seatLayerSeatIcon-${props.iconKey}`}
  />;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The two `react-native-svg` exports the built-in renderer needs.
 *
 * Typed structurally rather than imported: this package must build in an app
 * that does not have the module, and a bundler resolves `require` statically,
 * so a guarded import at module scope is not an option — it would make the
 * dependency mandatory in every consumer's build graph.
 */
export interface SeatLayerPickerSvgIconModules {
  readonly Svg: React.ComponentType<Record<string, unknown>>;
  readonly Path: React.ComponentType<Record<string, unknown>>;
  /** Optional: without it the circles in a glyph are drawn as paths. */
  readonly Circle?: React.ComponentType<Record<string, unknown>>;
}

/**
 * Installs the built-in vector renderer, drawing the glyphs with the host's
 * own `react-native-svg`.
 *
 * `react-native-svg` is an OPTIONAL peer. A host that has it calls this once at
 * start-up with its own imports — the same shape as
 * {@link setSeatLayerPickerSpotlightBlur} — and every glyph in the picker is
 * drawn natively, so it scales without resampling and takes the row's ink
 * directly. A host without it keeps the PNG masks.
 *
 * ```tsx
 * import Svg, { Circle, Path } from 'react-native-svg';
 * installSeatLayerPickerSvgIcons({ Svg, Path, Circle });
 * ```
 *
 * Pass `undefined` to go back to the fallback.
 */
export function installSeatLayerPickerSvgIcons(
  modules: SeatLayerPickerSvgIconModules | undefined,
): void {
  if (modules === undefined) { setSeatLayerPickerSeatIconRenderer(undefined); return; }
  const { Svg, Path, Circle } = modules;
  setSeatLayerPickerSeatIconRenderer(function SeatLayerPickerSvgSeatIcon(
    props: SeatLayerPickerSeatIconProps,
  ): React.ReactElement | null {
    const glyph = seatLayerPickerSeatGlyphs[props.iconKey];
    if (glyph === undefined) return null;
    const size = props.size ?? seatLayerPickerSeatIconViewBox;
    const box = seatLayerPickerSeatIconViewBox;
    const children: React.ReactElement[] = [];
    (glyph.circles ?? []).forEach((circle, index) => {
      const [cx, cy, r] = circle;
      children.push(Circle === undefined
        // Two arcs make a full circle; one arc of 360° is a no-op in SVG.
        ? <Path
          d={`M${cx! - r!} ${cy} a${r} ${r} 0 1 0 ${r! * 2} 0 a${r} ${r} 0 1 0 ${-(r! * 2)} 0`}
          key={`c${index}`}
        />
        : <Circle cx={cx} cy={cy} key={`c${index}`} r={r} />);
    });
    (glyph.paths ?? []).forEach((d, index) => children.push(<Path d={d} key={`p${index}`} />));
    (glyph.fills ?? []).forEach((d, index) => children.push(
      <Path d={d} fill={props.color} key={`f${index}`} stroke="none" />,
    ));
    return <Svg
      accessibilityElementsHidden
      fill="none"
      height={size}
      importantForAccessibility="no-hide-descendants"
      stroke={props.color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={seatLayerPickerSeatIconStrokeWidth}
      style={props.style}
      testID={`seatLayerSeatIcon-${props.iconKey}`}
      viewBox={`0 0 ${box} ${box}`}
      width={size}
    >{children}</Svg>;
  });
}
