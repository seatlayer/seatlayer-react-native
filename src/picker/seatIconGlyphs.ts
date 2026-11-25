/** The square every glyph below is authored in. */
export const seatLayerPickerSeatIconViewBox = 20;

/** Stroke weight at the authored box size, scaled with the drawn size. */
export const seatLayerPickerSeatIconStrokeWidth = 1.45;

/** One glyph: the circles the web draws as `<circle>`, then its `<path>` data. */
export interface SeatLayerPickerSeatGlyph {
  /** `[cx, cy, r]` per circle, in the 20-unit box. */
  readonly circles?: readonly (readonly number[])[];
  /** SVG path data, in the 20-unit box, stroked. */
  readonly paths?: readonly string[];
  /** SVG path data painted FILLED — the web's `fill="currentColor"` shapes. */
  readonly fills?: readonly string[];
}

/**
 * Every glyph the picker can ask for, by the runtime's own key.
 *
 * The twelve accommodation keys are the runtime's `accessibility[]` values;
 * `restrictedView`, `obstructedView` and `premium` are its commercial marks;
 * `note` is the organizer's free sentence. `contrast` is deliberately NOT a
 * seat attribute — the accessibility sheet's colour row recolours the map
 * rather than picking seats, so it wears a contrast disc.
 */
export const seatLayerPickerSeatGlyphs: Readonly<Record<string, SeatLayerPickerSeatGlyph>> = Object.freeze({
  // A seated figure over a wheel — an outline so it does not read as a blob
  // beside eleven outline siblings.
  wheelchair: Object.freeze({
    circles: Object.freeze([Object.freeze([10.6, 3.7, 1.7]), Object.freeze([9.7, 13.3, 4.7])]),
    paths: Object.freeze(['M8.9 6.3v4.3a1.3 1.3 0 0 0 1.3 1.3h3.4l1.9 4.5h1.9']),
  }),
  companion: Object.freeze({
    circles: Object.freeze([Object.freeze([6, 6, 2]), Object.freeze([14, 6, 2])]),
    paths: Object.freeze([
      'M2.5 16v-3.5A3.5 3.5 0 0 1 6 9a3.5 3.5 0 0 1 3.5 3.5V16' +
      'M10.5 16v-3.5A3.5 3.5 0 0 1 14 9a3.5 3.5 0 0 1 3.5 3.5V16',
    ]),
  }),
  'semi-ambulatory': Object.freeze({
    circles: Object.freeze([Object.freeze([8, 4, 1.7])]),
    paths: Object.freeze(['m8 6 2 4 3 2M10 10l-2 3-1 4M10 10l2 7M14 7l2 10']),
  }),
  'designated-aisle': Object.freeze({
    paths: Object.freeze([
      'M3.5 5.5v7h8.5V10H6.5M5 12.5V17M11 12.5V17',
      'M13.5 6.5H19M16.5 4l2.5 2.5L16.5 9',
    ]),
  }),
  'step-free': Object.freeze({
    circles: Object.freeze([Object.freeze([5.5, 5, 1.7])]),
    paths: Object.freeze(['M5.5 7v4l3 2M2.5 16.5H8l7-7h3M8 16.5h10']),
  }),
  hearing: Object.freeze({
    paths: Object.freeze([
      'M7 16c-1-1.2-1.5-2.4-1.5-3.8V9a5 5 0 1 1 10 0c0 2.2-1.2 3.2-2.6 4' +
      '-1.2.7-1.7 1.4-1.7 2.4A2.6 2.6 0 0 1 8.6 18',
    ]),
  }),
  cart: Object.freeze({
    paths: Object.freeze(['M8 6.5A4 4 0 1 0 8 13M17 6.5a4 4 0 1 0 0 6.5']),
  }),
  'sign-language': Object.freeze({
    paths: Object.freeze([
      'M6 16V8.5a1 1 0 0 1 2 0v3M8 11V5.5a1 1 0 0 1 2 0V11M10 11V4.5a1 1 0 0 ' +
      '1 2 0V11M12 11V6a1 1 0 0 1 2 0v6l1-1.5a1.2 1.2 0 0 1 2 1.3L14 17H9.5' +
      'A3.5 3.5 0 0 1 6 13.5',
    ]),
  }),
  'low-vision': Object.freeze({
    circles: Object.freeze([Object.freeze([10, 10, 2.5])]),
    paths: Object.freeze([
      'M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z',
      'm15 4 .5-1.5M17 5l1.5-.8',
    ]),
  }),
  'sensory-friendly': Object.freeze({
    paths: Object.freeze([
      'M4 11v-1a6 6 0 0 1 12 0v1M4 11h2.5v5H5a1 1 0 0 1-1-1v-4ZM16 11h-2.5v5' +
      'H15a1 1 0 0 0 1-1v-4Z',
      'M8.5 11.5c.8.7 2.2.7 3 0M9 14c.6.4 1.4.4 2 0',
    ]),
  }),
  'plus-size': Object.freeze({
    paths: Object.freeze([
      'M5 9V6.5A2.5 2.5 0 0 1 7.5 4h5A2.5 2.5 0 0 1 15 6.5V9M3.5 8.5v5h13v-5' +
      'M6 13.5V17M14 13.5V17',
    ]),
  }),
  'lift-armrest': Object.freeze({
    paths: Object.freeze([
      'M5 10V6.5A2.5 2.5 0 0 1 7.5 4h4A2.5 2.5 0 0 1 14 6.5V10M4 9v4h11V9' +
      'M6 13v4M13 13v4',
      'M17 11V4M15 6l2-2 2 2',
    ]),
  }),
  // An eye struck through: the view is BLOCKED, not merely poor.
  obstructedView: Object.freeze({
    paths: Object.freeze([
      'M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z',
      'm4 17 12-14',
    ]),
  }),
  // An eye carrying a caution mark: you can see, with a caveat.
  restrictedView: Object.freeze({
    paths: Object.freeze([
      'M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z',
      'M10 7.5v3.5M10 13.5h.01',
    ]),
  }),
  premium: Object.freeze({
    paths: Object.freeze(['m10 2.5 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7Z']),
  }),
  // The organizer's own words about this seat — an circled i, not an emoji.
  note: Object.freeze({
    circles: Object.freeze([Object.freeze([10, 10, 7.5])]),
    paths: Object.freeze(['M10 9.2v4.6M10 6.3h.01']),
  }),
  contrast: Object.freeze({
    circles: Object.freeze([Object.freeze([10, 10, 7.5])]),
    fills: Object.freeze(['M10 2.5a7.5 7.5 0 0 1 0 15Z']),
  }),
});
