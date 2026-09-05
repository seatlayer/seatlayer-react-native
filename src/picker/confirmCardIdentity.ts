import type { SelectedSeat } from "../types";
import { parseSeatLayerPickerColor } from "./colors";
import { normalizeSeatLayerPickerRowLabel } from "./format";
import { seatLayerPickerTokens } from "./tokens.g";

type Translator = (key: string, options?: { values?: Record<string, string> }) => string;

/** The em dash a present cell prints when the chart named nothing (§3.8.3). */
export const seatLayerPickerConfirmMissingValue = "—";

/** How much of the decision row the quiet answer takes; the web's `flex:0 0 34%`. */
export const seatLayerPickerConfirmCancelShare = 0.34;

/** The near-black a solid category band prints on where white cannot (§3.8.3). */
export const seatLayerPickerConfirmBandDarkInk = "#0B0F19";

/** One labelled cell of the identity grid: an eyebrow over one value. */
export interface SeatLayerPickerConfirmIdentityCell {
  readonly key: string;
  readonly value: string;
  /** Only a long section drops to the small wrapping type (§3.8.3). */
  readonly long: boolean;
}

/**
 * The identity grid's cells, in reading order.
 *
 * Section only where the chart named one — the grid is then two equal cells —
 * row only where there is a row, and the place cell always, so the buyer
 * always reads the same three (or two) places.
 */
export function seatLayerPickerConfirmIdentityCells(
  seat: SelectedSeat,
  sectionId: string | undefined,
  translate: Translator,
): readonly SeatLayerPickerConfirmIdentityCell[] {
  const section = clean(seat.sectionLabel);
  const row = normalizeSeatLayerPickerRowLabel(clean(seat.rowLabel), section, sectionId);
  const place = clean(seat.seatNumber) || clean(seat.displayLabel) || clean(seat.label);
  return Object.freeze([
    ...(section
      ? [cell(translate("sectionWord"), section, section.length > seatLayerPickerTokens.size.confirmSectionShortMax)]
      : []),
    ...(row ? [cell(rowWord(seat, translate), row)] : []),
    cell(placeWord(seat, translate), place || seatLayerPickerConfirmMissingValue),
  ]);
}

/**
 * The card's identity as ONE sentence, which is also the dialog's own name
 * (§3.8.6) — never six unlabelled cells read out in turn.
 */
export function seatLayerPickerConfirmIdentity(
  seat: SelectedSeat,
  sectionId: string | undefined,
  translate: Translator,
  extras: readonly (string | undefined)[] = [],
): string {
  const section = clean(seat.sectionLabel);
  const cells = seatLayerPickerConfirmIdentityCells(seat, sectionId, translate);
  const parts = [
    // The section reads as itself; a row and a place are named by their word.
    ...cells.map((entry) => entry.value === section && section ? entry.value : `${entry.key} ${entry.value}`),
    ...extras.map((value) => clean(value)).filter(Boolean),
  ];
  return translate("seatIdentity", { values: { parts: parts.join(" \u00b7 ") } });
}

/**
 * The ink a full-bleed category band prints its two words in.
 *
 * White wherever white clears the 3:1 floor those bold 11-18 pt sizes are read
 * at, and the near-black otherwise, so a pale category keeps its name. The two
 * candidates are fixed: the band never manufactures a colour of its own.
 */
export function seatLayerPickerConfirmBandInk(band: string): string {
  return seatLayerPickerContrastRatio("#FFFFFF", band) >= 3
    ? "#FFFFFF"
    : seatLayerPickerConfirmBandDarkInk;
}

/**
 * The accent blended toward the text ink until it clears 4.5:1 on BOTH the
 * surface and the teaser's own ground — the web's `--sl-accent-text`.
 */
export function seatLayerPickerReadableAccent(
  accent: string,
  surface: string,
  ground: string,
  text: string,
): string {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = step === 0 ? accent : mix(accent, text, step / 20);
    if (candidate === undefined) return accent;
    if (
      seatLayerPickerContrastRatio(candidate, surface) >= 4.5 &&
      seatLayerPickerContrastRatio(candidate, ground) >= 4.5
    ) return candidate;
  }
  return text;
}

/** The WCAG contrast ratio between two opaque colours, 1 to 21. */
export function seatLayerPickerContrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === undefined || second === undefined) return 1;
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function cell(key: string, value: string, long = false): SeatLayerPickerConfirmIdentityCell {
  return Object.freeze({ key, value, long });
}

/** What the chart calls a row, where it called it anything. */
function rowWord(seat: SelectedSeat, translate: Translator): string {
  return clean(seat.displayType) || clean(seat.rowType) || translate("rowWord");
}

function placeWord(seat: SelectedSeat, translate: Translator): string {
  return seat.objectType === "booth" ? translate("placeWord") : translate("seatWord");
}

function mix(from: string, to: string, amount: number): string | undefined {
  const a = parseSeatLayerPickerColor(from);
  const b = parseSeatLayerPickerColor(to);
  if (!a || !b) return undefined;
  const channel = (left: number, right: number) => Math.round(left * (1 - amount) + right * amount);
  return `rgb(${channel(a.red, b.red)}, ${channel(a.green, b.green)}, ${channel(a.blue, b.blue)})`;
}

function relativeLuminance(color: string): number | undefined {
  const parsed = parseSeatLayerPickerColor(color);
  if (!parsed) return undefined;
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(parsed.red) + 0.7152 * channel(parsed.green) + 0.0722 * channel(parsed.blue);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
