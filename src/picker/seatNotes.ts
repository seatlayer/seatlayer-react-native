import type { SeatLayerPickerStringResolver } from './locale';
import { seatLayerPickerLocaleStrings } from './strings.g';
import type { SeatCommercialAttributes, SelectedSeat } from '../types';

/**
 * SEAT NOTES — the one list of what a seat's own attributes say (spec §3.8.9).
 *
 * A seat can carry twelve accommodations, a wheelchair provision, three selling
 * marks and the organizer's own sentence, and every surface that mentioned any
 * of them used to decide for itself which ones matter. The ANSWER lives here
 * and the surfaces only draw it: the seat card draws the rows as bands with
 * their glyphs, the cart card says the same rows ONCE and in WORDS.
 *
 * LANE BOUNDARY: this is Lane A's model, defined here to the same signature so
 * the cart can be built and pinned before §3.8.9 lands. When Lane A's
 * `seatLayerPickerSeatNotes` merges, this file is deleted and the imports move
 * — the row shape, the order and the two rules below must match exactly.
 *
 * The two rules worth naming:
 *  * **Restricted and obstructed are separate rows.** Collapsing them with
 *    restricted winning told a buyer behind both a rail and a pillar about the
 *    rail and never about the pillar.
 *  * **A wheelchair seat with a provision gets the provision row INSTEAD.**
 *    "Empty wheelchair space" already says everything "Wheelchair space" would.
 */

/** How a note row reads: its meaning is here, its colour is the surface's. */
export type SeatLayerPickerSeatNoteTone = 'access' | 'warn' | 'premium' | 'note';

/** One row of a seat's notes. */
export interface SeatLayerPickerSeatNote {
  /** Stable identity for the row, for keying and for tests. */
  readonly key: string;
  /** Which drawing in the shared glyph set this row wears. */
  readonly iconKey: string;
  /** The row's title, already in the buyer's language. */
  readonly title: string;
  readonly tone: SeatLayerPickerSeatNoteTone;
  /** The organizer's free text, attached to the row it belongs to. */
  readonly note?: string;
}

const wheelchairKey = 'wheelchair';

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Every row a seat's attributes earn, in reading order.
 *
 * The order is fixed and is not discovery order: what the seat PROVIDES first
 * (accommodations, then the physical wheelchair fact), then what a buyer should
 * know before paying (restricted, obstructed, premium), then the organizer's
 * own words. Two seats with the same attributes always produce the same list.
 */
export function seatLayerPickerSeatNoteRows(input: Readonly<{
  strings: SeatLayerPickerStringResolver;
  accessibility?: readonly string[] | undefined;
  wheelchairSpaceType?: string | undefined;
  commercial?: Readonly<SeatCommercialAttributes> | undefined;
}>): readonly SeatLayerPickerSeatNote[] {
  const { strings } = input;
  const rows: SeatLayerPickerSeatNote[] = [];
  const provision = trimmed(input.wheelchairSpaceType);
  for (const type of input.accessibility ?? []) {
    if (type === wheelchairKey && provision !== undefined) continue;
    // A key this build's taxonomy does not know is not printed as its own key:
    // a wire value is not a sentence, and an unresolved key comes back as
    // itself, so `accessNeeds.some-new-thing` would land on a buyer's card.
    const key = `accessNeeds.${type}`;
    if (!(key in seatLayerPickerLocaleStrings.en)) continue;
    rows.push({ key: `access:${type}`, iconKey: type, title: strings.translate(key), tone: 'access' });
  }
  if (provision === 'no-seat') {
    rows.push({
      key: 'wheelchair:no-seat',
      iconKey: wheelchairKey,
      title: strings.translate('emptyWheelchairSpace'),
      tone: 'access',
    });
  } else if (provision === 'seat-present') {
    rows.push({
      key: 'wheelchair:seat-present',
      iconKey: wheelchairKey,
      title: strings.translate('accessiblePhysicalSeat'),
      tone: 'access',
    });
  }
  const commercial = input.commercial;
  if (commercial?.restrictedView === true) {
    rows.push({
      key: 'mark:restrictedView', iconKey: 'restrictedView',
      title: strings.translate('restrictedView'), tone: 'warn',
    });
  }
  if (commercial?.obstructedView === true) {
    rows.push({
      key: 'mark:obstructedView', iconKey: 'obstructedView',
      title: strings.translate('obstructedView'), tone: 'warn',
    });
  }
  if (commercial?.premium === true) {
    rows.push({
      key: 'mark:premium', iconKey: 'premium',
      title: strings.translate('premiumSeat'), tone: 'premium',
    });
  }
  const note = trimmed(commercial?.note);
  if (note === undefined) return Object.freeze(rows);
  // The sentence belongs to the FIRST selling mark on the seat: an organizer
  // writing "pillar at the aisle end" is explaining the restriction, not adding
  // a second unrelated fact. With no mark to explain, it is its own row.
  const owner = rows.findIndex((row) => row.tone === 'warn' || row.tone === 'premium');
  if (owner >= 0) {
    rows[owner] = { ...rows[owner]!, note };
    return Object.freeze(rows);
  }
  rows.push({
    key: 'note', iconKey: 'note',
    title: strings.translate('organizerNote'), tone: 'note', note,
  });
  return Object.freeze(rows);
}

/** The rows a selected seat earns, read from the runtime's own fields. */
export function seatLayerPickerSeatNotes(
  seat: Readonly<SelectedSeat> | null | undefined,
  strings: SeatLayerPickerStringResolver,
): readonly SeatLayerPickerSeatNote[] {
  if (seat === null || seat === undefined) return Object.freeze([]);
  return seatLayerPickerSeatNoteRows({
    strings,
    accessibility: seat.accessibility,
    wheelchairSpaceType: seat.wheelchairSpaceType,
    commercial: seat.commercial,
  });
}

/** The whole row as it is read out. */
export function seatLayerPickerSeatNoteSpoken(note: SeatLayerPickerSeatNote): string {
  return note.note === undefined ? note.title : `${note.title}: ${note.note}`;
}
