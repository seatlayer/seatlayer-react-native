import type { SeatLayerVisualFixtureScenario } from '../fixtures/PickerVisualFixture';

interface Screen {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly side?: number;
  readonly bottom: number;
}

export interface Cell {
  readonly screen: Screen;
  readonly scenario: SeatLayerVisualFixtureScenario;
  readonly text: 1 | 1.3 | 2;
  readonly mode: 'light' | 'dark';
  readonly rtl: boolean;
}

/** Phones, upright. The insets are those of a common phone of that width. */
export const upright: readonly Screen[] = [
  { name: '320', width: 320, height: 568, top: 20, bottom: 0 },
  { name: '360', width: 360, height: 740, top: 24, bottom: 24 },
  { name: '375', width: 375, height: 667, top: 20, bottom: 0 },
  { name: '390', width: 390, height: 844, top: 47, bottom: 34 },
  { name: '393', width: 393, height: 852, top: 59, bottom: 34 },
  { name: '412', width: 412, height: 915, top: 24, bottom: 24 },
  { name: '430', width: 430, height: 932, top: 59, bottom: 34 },
];

/** Phones, sideways. */
export const sideways: readonly Screen[] = [
  { name: '667x375', width: 667, height: 375, top: 0, bottom: 0 },
  { name: '844x390', width: 844, height: 390, top: 0, side: 47, bottom: 21 },
  { name: '915x412', width: 915, height: 412, top: 24, bottom: 24 },
];

const tablet: Screen = { name: '1024x1366', width: 1024, height: 1366, top: 24, bottom: 20 };

const scenarios: readonly SeatLayerVisualFixtureScenario[] = [
  'overview',
  'section',
  'floors',
  'confirmation',
  'cart-peek',
  'cart-expanded',
  'cart-dense',
  'held',
  'long-total',
  'sales-closed',
  'best-seats',
  'venue-3d',
  'seat-view',
  'loading',
  'error',
  'action-error',
  'empty',
  'general-admission',
  'variable-table',
  'table-card',
];

function cells(
  screens: readonly Screen[],
  texts: readonly Cell['text'][],
  options: Readonly<{ mode?: Cell['mode']; rtl?: boolean; only?: Cell['scenario'][] }> = {},
): Cell[] {
  return screens.flatMap((screen) =>
    texts.flatMap((text) =>
      (options.only ?? scenarios).map((scenario) => ({
        screen,
        scenario,
        text,
        mode: options.mode ?? 'light',
        rtl: options.rtl ?? false,
      }))));
}

const pick = (...names: string[]) =>
  [...upright, ...sideways].filter((screen) => names.includes(screen.name));

/** Every cell the layout checks read. */
export const layoutCells: readonly Cell[] = [
  ...cells(upright, [1, 1.3, 2]),
  ...cells(pick('320', '390'), [1, 1.3, 2], { rtl: true }),
  ...cells(sideways, [1, 1.3]),
];

const main: Cell['scenario'][] = ['overview', 'confirmation', 'table-card', 'cart-expanded', 'venue-3d'];

/** The cells that are drawn and compared. */
export const pictureCells: readonly Cell[] = [
  ...cells(pick('390'), [1], {
    only: [...main, 'floors', 'seat-view', 'best-seats', 'error', 'action-error', 'general-admission', 'empty'],
  }),
  ...cells(pick('390'), [1], { mode: 'dark', only: main }),
  ...cells(pick('320'), [1], { only: main }),
  ...cells(pick('320', '390'), [2], { only: ['overview', 'confirmation', 'table-card', 'cart-expanded'] }),
  ...cells(pick('430'), [1], { only: ['overview', 'table-card', 'cart-expanded'] }),
  ...cells(pick('390'), [1.3], { only: ['table-card'] }),
  ...cells(pick('390'), [1], { rtl: true, only: main }),
  ...cells(sideways, [1], { only: ['overview', 'confirmation', 'table-card', 'cart-expanded'] }),
  ...cells([tablet], [1], { only: ['overview', 'cart-expanded'] }),
];

export function cellName({ mode, rtl, scenario, screen, text }: Cell): string {
  return [screen.name, scenario, `text${text}`, rtl ? 'rtl' : '', mode]
    .filter(Boolean)
    .join('_');
}

export function cellAddress({ mode, rtl, scenario, screen, text }: Cell): string {
  const query = new URLSearchParams({
    scenario,
    mode,
    text: String(text),
    top: String(screen.top),
    bottom: String(screen.bottom),
    left: String(screen.side ?? 0),
    right: String(screen.side ?? 0),
    ...(rtl ? { rtl: '1' } : {}),
  });
  return `index.html?${query}`;
}
