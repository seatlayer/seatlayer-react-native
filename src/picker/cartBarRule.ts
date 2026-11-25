/**
 * How the phone's cart row stands, worked out from the widths of its words.
 *
 * One row: a circle, the words, the button. The button takes the width of its
 * own words, up to 46% of the row and two balanced lines; only where its words
 * need more than that does it go under the others, at full width.
 */

/** The row's own measures, in points at text size 1. */
export const seatLayerCartBarSize = Object.freeze({
  line: 1,
  padX: 12,
  padY: 10,
  gap: 10,
  /** Between the words and a button that stands under them. */
  underGap: 8,
  minHeight: 44,
  disc: 28,
  chevron: 16,
  buttonPadX: 14,
  buttonPadY: 6,
  buttonMinWidth: 112,
  buttonRadius: 7.7,
  /** The part of the row a button beside the words may take. */
  buttonMaxShare: .46,
  buttonFont: 14,
  buttonLine: 1.1,
  countFont: 13.5,
  totalFont: 14.5,
  totalGap: 7,
  namesFont: 12.5,
  wordsLine: 18,
  /** The row while a seat card is asking. */
  askingOpacity: .58,
  /** The cards, or the best-seats form, over the row. */
  listMaxHeight: 240,
  /** Under the last card, over the line. */
  listPadBottom: 10,
});

/** The button's letters, the largest that fits first. */
export const seatLayerCartBarLetters: readonly number[] = Object.freeze([
  seatLayerCartBarSize.buttonFont, 12.5, 11.5,
]);

/** The widths of one label at one letter size. */
export interface SeatLayerCartBarWidths {
  /** The whole label on one line. */
  readonly whole: number;
  /** Each part a line may not break. */
  readonly parts: readonly number[];
}

/**
 * The parts a line may not break. Scripts written without spaces break between
 * their own letters.
 */
export function seatLayerCartBarParts(label: string): readonly string[] {
  return label.split(/\s+/u).filter(Boolean).flatMap((word) =>
    unspaced.test(word) ? [...word] : [word]);
}

const unspaced = /[฀-๿぀-ヿ㐀-鿿豈-﫿]/u;

function gapOf(widths: SeatLayerCartBarWidths): number {
  if (widths.parts.length < 2) return 0;
  const sum = widths.parts.reduce((total, part) => total + part, 0);
  return Math.max(0, (widths.whole - sum) / (widths.parts.length - 1));
}

/** How many lines the label takes in `room`, as the text engines break it. */
export function seatLayerCartBarLines(widths: SeatLayerCartBarWidths, room: number): number {
  const gap = gapOf(widths);
  let lines = 1;
  let used = 0;
  for (const part of widths.parts) {
    const next = used === 0 ? part : used + gap + part;
    if (used > 0 && next > room + .01) {
      lines += 1;
      used = part;
    } else {
      used = next;
    }
  }
  return lines;
}

function longestPart(widths: SeatLayerCartBarWidths): number {
  return widths.parts.reduce((longest, part) => Math.max(longest, part), 0);
}

function fitsTwoLines(widths: SeatLayerCartBarWidths, room: number): boolean {
  return longestPart(widths) <= room && seatLayerCartBarLines(widths, room) <= 2;
}

/** The narrowest width that keeps the label on as many lines as `room` gives it. */
export function seatLayerCartBarBalanced(widths: SeatLayerCartBarWidths, room: number): number {
  const lines = seatLayerCartBarLines(widths, room);
  if (lines < 2) return Math.min(room, widths.whole);
  let low = Math.min(room, longestPart(widths));
  let high = room;
  while (high - low > .5) {
    const middle = (low + high) / 2;
    if (seatLayerCartBarLines(widths, middle) <= lines) high = middle;
    else low = middle;
  }
  return high;
}

export interface SeatLayerCartBarRuleInput {
  /** The row's width, its own padding included. */
  readonly width: number;
  /**
   * The button's own words: every label that stays on it. All of them are
   * tested, so that the row stands the same in every state.
   */
  readonly own: readonly SeatLayerCartBarWidths[];
  /** The label it wears now, at each of `seatLayerCartBarLetters`. */
  readonly label: readonly SeatLayerCartBarWidths[];
  /** Whether the label is one of its own words; those never get smaller. */
  readonly labelIsOwn: boolean;
}

export interface SeatLayerCartBarPlan {
  /** Whether the button stands under the words. */
  readonly under: boolean;
  readonly buttonWidth: number;
  /** The room its balanced words take. */
  readonly textWidth: number;
  /** An index into `seatLayerCartBarLetters`. */
  readonly letters: number;
  /** The room for the words beside the circle. */
  readonly wordsWidth: number;
}

export function seatLayerCartBarPlan(input: SeatLayerCartBarRuleInput): SeatLayerCartBarPlan {
  const size = seatLayerCartBarSize;
  const inner = Math.max(0, input.width - size.padX * 2);
  const besideDisc = Math.max(0, inner - size.disc - size.gap);
  const most = inner * size.buttonMaxShare;
  const room = most - size.buttonPadX * 2;
  const under = input.own.some((widths) => !fitsTwoLines(widths, room));
  let letters = 0;
  if (!under && !input.labelIsOwn) {
    const found = input.label.findIndex((widths) => fitsTwoLines(widths, room));
    letters = found < 0 ? input.label.length - 1 : found;
  }
  const label = input.label[letters] ?? input.label[0] ?? { whole: 0, parts: [] };
  if (under) {
    const textRoom = Math.max(0, inner - size.buttonPadX * 2);
    return Object.freeze({
      under,
      buttonWidth: inner,
      textWidth: Math.ceil(seatLayerCartBarBalanced(label, textRoom)) + 1,
      letters,
      wordsWidth: besideDisc,
    });
  }
  const natural = Math.ceil(label.whole + size.buttonPadX * 2) + 1;
  const buttonWidth = Math.min(most, Math.max(size.buttonMinWidth, natural));
  return Object.freeze({
    under,
    buttonWidth,
    textWidth: Math.min(
      buttonWidth - size.buttonPadX * 2,
      Math.ceil(seatLayerCartBarBalanced(label, buttonWidth - size.buttonPadX * 2)) + 1,
    ),
    letters,
    wordsWidth: Math.max(0, besideDisc - size.gap - buttonWidth),
  });
}

/** Whether the count and the total stand on one line, and the total's own size. */
export function seatLayerCartBarTotal(
  count: number, total: number, room: number,
): Readonly<{ beside: boolean; scale: number }> {
  if (count + seatLayerCartBarSize.totalGap + total <= room) return Object.freeze({ beside: true, scale: 1 });
  // The total is never cut: a longer one is drawn smaller.
  return Object.freeze({ beside: false, scale: total > room && total > 0 ? Math.max(.5, room / total) : 1 });
}
