import { blendSeatLayerPickerColor, parseSeatLayerPickerColor, seatLayerPickerColorAlpha } from './colors';
import { seatLayerPickerEnglishAccessNeeds } from './locale';
import { seatLayerPickerLocaleStrings } from './strings.g';
import { seatLayerPickerTokens } from './tokens.g';
import type { SeatCommercialAttributes, SelectedSeat } from '../types';

/**
 * §3.8.9 — the ONE list of what a seat's own attributes say.
 *
 * Five surfaces used to answer "what is special about this seat?" with their
 * own subset and their own emoji, and they disagreed: the tap card showed one
 * limited-view line in which restricted BEAT obstructed, so a seat behind both
 * a rail and a pillar reported only the rail; the cart showed markers; premium
 * reached two surfaces out of five.
 *
 * So the answer is a MODEL and the surfaces only draw it.
 * {@link seatLayerPickerSeatNotes} decides which rows a seat earns and in what
 * order; the confirm card draws them as full-bleed bands, and the cart card
 * says the same rows in words on one line (§3.10). It mirrors `core/seatNotes.ts`
 * in the runtime, and `seatLayerSeatNoteRows` in the reference port, row for
 * row — including the two rules worth naming:
 *
 *  - **Restricted and obstructed are separate rows**, never collapsed.
 *  - **A wheelchair accommodation with a provision yields the PROVISION row
 *    only:** "empty wheelchair space" already says everything "wheelchair
 *    space" would, and more precisely.
 */

/** How a note row reads: its meaning is here, its colour is the surface's. */
export type SeatLayerPickerSeatNoteTone = 'access' | 'warn' | 'premium' | 'note';

/** One row of a seat's notes. */
export interface SeatLayerPickerSeatNote {
  /** Stable identity for the row, for keying and for tests. */
  readonly key: string;
  /** Which drawing in `seatLayerPickerSeatGlyphs` this row wears. */
  readonly iconKey: string;
  /** The row's title, already in the buyer's language. */
  readonly title: string;
  /** The tone the surface paints it in. */
  readonly tone: SeatLayerPickerSeatNoteTone;
  /** The organizer's free text, attached to the row it belongs to. */
  readonly note?: string;
}

/** The little of the string resolver a row model needs. */
export interface SeatLayerPickerSeatNoteStrings {
  translate(key: string, options?: never): string;
}

export interface SeatLayerPickerSeatNoteInput {
  readonly strings: SeatLayerPickerSeatNoteStrings;
  readonly accessibility?: readonly string[];
  readonly wheelchairSpaceType?: string;
  readonly commercial?: SeatCommercialAttributes;
}

const wheelchairKey = 'wheelchair';
const accessNeedsPrefix = 'accessNeeds.';

/** The twelve keys this build has a name and a drawing for. */
const knownAccessNeeds: ReadonlySet<string> = new Set(
  Object.keys(seatLayerPickerEnglishAccessNeeds),
);

/**
 * The name for one accessibility key, or `undefined` where this build's
 * taxonomy has none.
 *
 * A key with no name is DROPPED rather than printed raw: `sensory-friendly`
 * spelled out in a band is a defect a buyer can read. Host overrides and the
 * thirty-seven generated locales both reach it through `translate`; the
 * English dictionary is the fallback because the token strings carry the
 * accessibility SHEET's shorter wording rather than these names.
 */
export function seatLayerPickerSeatNoteAccessLabel(
  key: string,
  strings: SeatLayerPickerSeatNoteStrings,
): string | undefined {
  if (!knownAccessNeeds.has(key)) return undefined;
  const dictionaryKey = `${accessNeedsPrefix}${key}`;
  const translated = strings.translate(dictionaryKey);
  if (typeof translated === 'string' && translated !== dictionaryKey && translated.length > 0) {
    return translated;
  }
  const english = (seatLayerPickerLocaleStrings.en as Readonly<Record<string, string>>)[dictionaryKey];
  return typeof english === 'string' && english.length > 0 ? english : undefined;
}

/**
 * Every row a seat's attributes earn, in reading order.
 *
 * The order is fixed and is not discovery order: what the seat PROVIDES first
 * (accommodations, then the physical wheelchair fact), then what a buyer should
 * know before paying (restricted, obstructed, premium), then the organizer's
 * own words. Two seats with the same attributes always produce the same list.
 */
export function seatLayerPickerSeatNoteRows(
  input: SeatLayerPickerSeatNoteInput,
): readonly SeatLayerPickerSeatNote[] {
  const rows: SeatLayerPickerSeatNote[] = [];
  const provision = input.wheelchairSpaceType;
  const strings = input.strings;
  for (const type of input.accessibility ?? []) {
    if (type === wheelchairKey && provision !== undefined) continue;
    const label = seatLayerPickerSeatNoteAccessLabel(type, strings);
    if (label === undefined) continue;
    rows.push({ key: `access:${type}`, iconKey: type, title: label, tone: 'access' });
  }
  if (provision === 'no-seat') {
    rows.push({
      key: 'wheelchair:no-seat', iconKey: wheelchairKey,
      title: strings.translate('emptyWheelchairSpace'), tone: 'access',
    });
  } else if (provision === 'seat-present') {
    rows.push({
      key: 'wheelchair:seat-present', iconKey: wheelchairKey,
      title: strings.translate('accessiblePhysicalSeat'), tone: 'access',
    });
  }
  if (input.commercial?.restrictedView === true) {
    rows.push({
      key: 'mark:restrictedView', iconKey: 'restrictedView',
      title: strings.translate('restrictedView'), tone: 'warn',
    });
  }
  if (input.commercial?.obstructedView === true) {
    rows.push({
      key: 'mark:obstructedView', iconKey: 'obstructedView',
      title: strings.translate('obstructedView'), tone: 'warn',
    });
  }
  if (input.commercial?.premium === true) {
    rows.push({
      key: 'mark:premium', iconKey: 'premium',
      title: strings.translate('premiumSeat'), tone: 'premium',
    });
  }
  const note = input.commercial?.note?.trim();
  if (note === undefined || note.length === 0) return Object.freeze(rows.map(freezeRow));
  // The sentence belongs to the FIRST selling mark on the seat: an organizer
  // writing "pillar at the aisle end" is explaining the restriction, not
  // adding a second unrelated fact. With no mark to explain, it is its own row.
  const owner = rows.findIndex((row) => row.tone === 'warn' || row.tone === 'premium');
  if (owner >= 0) {
    rows[owner] = { ...(rows[owner] as SeatLayerPickerSeatNote), note };
    return Object.freeze(rows.map(freezeRow));
  }
  rows.push({
    key: 'note', iconKey: 'note',
    title: strings.translate('organizerNote'), tone: 'note', note,
  });
  return Object.freeze(rows.map(freezeRow));
}

/**
 * The rows a selected seat earns, read from the runtime's own fields.
 *
 * This is the function the confirm card and the cart card both call; a surface
 * that decides for itself which attributes matter is how the five drifted.
 */
export function seatLayerPickerSeatNotes(
  seat: Readonly<Pick<SelectedSeat, 'accessibility' | 'wheelchairSpaceType' | 'commercial'>>,
  strings: SeatLayerPickerSeatNoteStrings,
): readonly SeatLayerPickerSeatNote[] {
  return seatLayerPickerSeatNoteRows({
    strings,
    accessibility: seat.accessibility,
    wheelchairSpaceType: seat.wheelchairSpaceType,
    commercial: seat.commercial,
  });
}

/** What one tone paints: the band's ground, its title ink, its body ink. */
export interface SeatLayerPickerSeatNoteToneColors {
  /** The band's own ground, tinted out of the surface it sits on. */
  readonly ground: string;
  /** The title's ink, measured against `ground` rather than the surface. */
  readonly ink: string;
  /** The organizer's second line, one step quieter than `ink`. */
  readonly bodyInk: string;
  /** The glyph's ink: muted on a neutral row, the title's on a toned one. */
  readonly iconInk: string;
}

/** The colours a note row needs, whichever surface draws it. */
export interface SeatLayerPickerSeatNotePalette {
  readonly surface: string;
  readonly text: string;
  readonly mutedText: string;
  readonly divider: string;
  readonly warning: string;
  readonly warnText: string;
  readonly premium: string;
  readonly premiumText: string;
}

/**
 * The three note roles the theme does not carry yet, read from the tokens for
 * the resolved mode.
 *
 * `warnText`, `premium` and `premiumText` are token colours with no host
 * override of their own: they were measured against the tint each pair
 * actually paints on — light 5.46:1 (warn) and 5.67:1 (premium), dark 8.24:1
 * and 8.03:1 — and a host colour would be measured against nothing.
 */
export function seatLayerPickerSeatNotePalette(
  colors: Readonly<{
    surface: string; text: string; mutedText?: string; divider: string;
    warning?: string; warnText?: string; premium?: string; premiumText?: string;
  }>,
  themeMode: 'light' | 'dark' | (string & {}) | undefined,
): SeatLayerPickerSeatNotePalette {
  // A host theme that never resolved a mode still has to paint: light is what
  // `resolveSeatLayerPickerTheme` falls back to, so the palette does too.
  const tone = themeMode === 'dark'
    ? seatLayerPickerTokens.color.dark
    : seatLayerPickerTokens.color.light;
  // All four note roles are THEME roles, so a host that brands the picker
  // brands its seat notes with it. Reading them off the tokens regardless left
  // a branded picker with two amber schemes in one card.
  return Object.freeze({
    surface: colors.surface,
    text: colors.text,
    mutedText: colors.mutedText ?? colors.text,
    divider: colors.divider,
    warning: colors.warning ?? tone.warning,
    warnText: colors.warnText ?? tone.warnText,
    premium: colors.premium ?? tone.premium,
    premiumText: colors.premiumText ?? tone.premiumText,
  });
}

/**
 * The colours `tone` paints on `palette`.
 *
 * Pure and exported so a test can measure the contrast of every pair against
 * the ground it ACTUALLY paints on, in both themes, rather than against the
 * surface each tint is mixed from — which is how a 1.8:1 amber shipped.
 */
export function seatLayerPickerSeatNoteToneColors(
  palette: SeatLayerPickerSeatNotePalette,
  tone: SeatLayerPickerSeatNoteTone,
): SeatLayerPickerSeatNoteToneColors {
  const opacity = seatLayerPickerTokens.opacity;
  const wash = (color: string, value: number): string =>
    blendSeatLayerPickerColor(color, palette.surface, value, palette.surface);
  const toned = tone === 'warn' || tone === 'premium';
  const ground = tone === 'warn'
    ? wash(palette.warning, opacity.noteToneWash)
    : tone === 'premium'
      ? wash(palette.premium, opacity.noteToneWash)
      : wash(palette.text, opacity.noteNeutralWash);
  const ink = tone === 'warn'
    ? palette.warnText
    : tone === 'premium' ? palette.premiumText : palette.text;
  return Object.freeze({
    ground,
    ink,
    // The organizer's second line is the muted ink walked a quarter of the way
    // toward the text: bare muted on the tint measures below the bar.
    bodyInk: blendSeatLayerPickerColor(
      palette.text, palette.mutedText, 1 - opacity.noteBodyInk, palette.mutedText,
    ),
    iconInk: toned ? ink : palette.mutedText,
  });
}

/** The hairline on the JOIN between two bands; there is none above the first. */
export function seatLayerPickerSeatNoteHairline(divider: string): string {
  // The divider token already carries an alpha; RE-alpha it rather than
  // blending it, or a dark slate lozenge comes back as a pale grey one.
  const alpha = parseSeatLayerPickerColor(divider)?.alpha ?? 1;
  return seatLayerPickerColorAlpha(divider, alpha * seatLayerPickerTokens.opacity.noteHairline);
}

function freezeRow(row: SeatLayerPickerSeatNote): SeatLayerPickerSeatNote {
  return Object.freeze(row);
}

/**
 * The whole row as it is read out.
 *
 * The cart card says a seat's notes in words rather than in bands, and a
 * screen reader must hear the organizer's sentence attached to the mark it
 * explains rather than as an orphan after it.
 */
export function seatLayerPickerSeatNoteSpoken(note: SeatLayerPickerSeatNote): string {
  return note.note === undefined ? note.title : `${note.title}: ${note.note}`;
}
