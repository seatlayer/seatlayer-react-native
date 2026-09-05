import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ fontScale: 1, announced: [] as string[], bold: false, boldListener: undefined as ((enabled: boolean) => void) | undefined }));

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    announceForAccessibility: (message: string) => { state.announced.push(message); },
    isBoldTextEnabled: () => Promise.resolve(state.bold),
    addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
      state.boldListener = listener;
      return { remove: () => { state.boldListener = undefined; } };
    },
  },
  PixelRatio: { getFontScale: () => state.fontScale },
}));

import {
  seatLayerPickerAnnounce,
  seatLayerPickerBoldTextStep,
  seatLayerPickerBoldWeight,
  seatLayerPickerClampedFontScale,
  seatLayerPickerReadingOrder,
  seatLayerPickerReadingOrderFor,
  seatLayerPickerReadingOrderId,
  seatLayerPickerReadingOrderIds,
  seatLayerPickerReadingRungs,
  seatLayerPickerScaledExtent,
  seatLayerPickerTypeScaleClamp,
  SeatLayerPickerBoldTextStore,
} from '../src/picker/a11y';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

describe('§4.10 reading order', () => {
  it('is the buyer order the spec names, spaced by a hundred', () => {
    expect(seatLayerPickerReadingOrder).toEqual({
      header: 100, rail: 200, map: 300, mapChrome: 400,
      dock: 500, prompt: 600, notice: 700, sheet: 800,
    });
  });

  it('walks the rungs ascending', () => {
    expect([...seatLayerPickerReadingRungs]).toEqual([
      'header', 'rail', 'map', 'mapChrome', 'dock', 'prompt', 'notice', 'sheet',
    ]);
  });

  it('gives every rung its own stable id', () => {
    const ids = Object.values(seatLayerPickerReadingOrderIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sorts by rung, not by the order the surfaces are painted', () => {
    const order = seatLayerPickerReadingOrderFor([
      { rung: 'map', mounted: true },
      { rung: 'mapChrome', mounted: true },
      { rung: 'dock', mounted: true },
      { rung: 'notice', mounted: true, suffix: 'toast' },
      { rung: 'prompt', mounted: true },
      { rung: 'header', mounted: true },
      { rung: 'sheet', mounted: true },
    ]);
    expect(order).toEqual([
      seatLayerPickerReadingOrderIds.header,
      seatLayerPickerReadingOrderIds.map,
      seatLayerPickerReadingOrderIds.mapChrome,
      seatLayerPickerReadingOrderIds.dock,
      seatLayerPickerReadingOrderIds.prompt,
      `${seatLayerPickerReadingOrderIds.notice}-toast`,
      seatLayerPickerReadingOrderIds.sheet,
    ]);
  });

  it('keeps the declaration order inside one rung, so the sort is stable', () => {
    expect(seatLayerPickerReadingOrderFor([
      { rung: 'notice', mounted: true, suffix: 'toast' },
      { rung: 'notice', mounted: true, suffix: 'overlays' },
      { rung: 'notice', mounted: true, suffix: 'status' },
    ])).toEqual([
      `${seatLayerPickerReadingOrderIds.notice}-toast`,
      `${seatLayerPickerReadingOrderIds.notice}-overlays`,
      `${seatLayerPickerReadingOrderIds.notice}-status`,
    ]);
  });

  it('leaves the dock rung empty on a default phone', () => {
    expect(seatLayerPickerReadingOrderFor([
      { rung: 'header', mounted: true },
      { rung: 'dock', mounted: false },
      { rung: 'sheet', mounted: true },
    ])).toEqual([seatLayerPickerReadingOrderIds.header, seatLayerPickerReadingOrderIds.sheet]);
  });

  it('orders nothing where nothing is mounted', () => {
    expect(seatLayerPickerReadingOrderFor([])).toEqual([]);
  });

  it('names one surface per rung without a suffix', () => {
    expect(seatLayerPickerReadingOrderId('map')).toBe(seatLayerPickerReadingOrderIds.map);
    expect(seatLayerPickerReadingOrderId('notice', 'toast')).toBe(`${seatLayerPickerReadingOrderIds.notice}-toast`);
  });
});

describe('§4.10 dynamic type', () => {
  it('reads its ceilings from the design token, never a transcribed number', () => {
    expect(seatLayerPickerTypeScaleClamp('rail')).toBe(seatLayerPickerTokens.type.scaleClamp.rail);
    expect(seatLayerPickerTypeScaleClamp('dock')).toBe(seatLayerPickerTokens.type.scaleClamp.dock);
    expect(seatLayerPickerTypeScaleClamp('peek')).toBe(seatLayerPickerTokens.type.scaleClamp.peek);
    expect(seatLayerPickerTypeScaleClamp('card')).toBe(seatLayerPickerTokens.type.scaleClamp.card);
    expect(seatLayerPickerTypeScaleClamp('sheet')).toBe(seatLayerPickerTokens.type.scaleClamp.sheet);
    expect(seatLayerPickerTypeScaleClamp('state')).toBe(seatLayerPickerTokens.type.scaleClamp.state);
  });

  it('caps the rail, the dock, the peek and the card at 1.3 and the sheet and states at 1.6', () => {
    expect(seatLayerPickerClampedFontScale(1.3, 2)).toBe(1.3);
    expect(seatLayerPickerClampedFontScale(1.6, 2)).toBe(1.6);
  });

  it('never shrinks a surface below its drawn height', () => {
    expect(seatLayerPickerClampedFontScale(1.3, 0.85)).toBe(1);
    expect(seatLayerPickerScaledExtent(48, 1.3, 0.85)).toBe(48);
  });

  it('changes nothing at the platform default of 1.0', () => {
    expect(seatLayerPickerScaledExtent(seatLayerPickerTokens.size.dockBarHeight, 1.3, 1)).toBe(seatLayerPickerTokens.size.dockBarHeight);
    expect(seatLayerPickerClampedFontScale(1.6, 1)).toBe(1);
  });

  it('grows a fixed height by the clamped scale', () => {
    expect(seatLayerPickerScaledExtent(40, 1.3, 1.2)).toBeCloseTo(48, 6);
    expect(seatLayerPickerScaledExtent(40, 1.3, 3)).toBeCloseTo(52, 6);
  });

  it('reads the live platform scale when none is passed', () => {
    state.fontScale = 1.5;
    expect(seatLayerPickerClampedFontScale(1.3)).toBe(1.3);
    expect(seatLayerPickerScaledExtent(40, 1.6)).toBeCloseTo(60, 6);
    state.fontScale = 1;
    expect(seatLayerPickerScaledExtent(40, 1.6)).toBe(40);
  });
});

describe('§4.10 bold text', () => {
  it('moves a weight two steps up', () => {
    expect(seatLayerPickerBoldTextStep).toBe(200);
    expect(seatLayerPickerBoldWeight(600, true)).toBe(800);
    expect(seatLayerPickerBoldWeight(400, true)).toBe(600);
  });

  it('clamps at 900', () => {
    expect(seatLayerPickerBoldWeight(800, true)).toBe(900);
    expect(seatLayerPickerBoldWeight(900, true)).toBe(900);
  });

  it('leaves the weight alone where the platform is not asking', () => {
    expect(seatLayerPickerBoldWeight(700, false)).toBe(700);
  });

  it('is one accessor over the platform setting, and it goes quiet on the last unsubscribe', async () => {
    state.bold = true;
    const store = new SeatLayerPickerBoldTextStore({
      isBoldTextEnabled: () => Promise.resolve(state.bold),
      addEventListener: (_event, listener) => {
        state.boldListener = listener;
        return { remove: () => { state.boldListener = undefined; } };
      },
    });
    let notified = 0;
    const stop = store.subscribe(() => { notified += 1; });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getSnapshot()).toBe(true);
    expect(notified).toBe(1);
    state.boldListener?.(false);
    expect(store.getSnapshot()).toBe(false);
    stop();
    expect(state.boldListener).toBeUndefined();
    state.bold = false;
  });
});

describe('§4.10 announcement', () => {
  it('says a message once and swallows a platform that cannot', () => {
    state.announced.length = 0;
    seatLayerPickerAnnounce('Seat added');
    expect(state.announced).toEqual(['Seat added']);
  });

  it('never announces empty words', () => {
    state.announced.length = 0;
    seatLayerPickerAnnounce('   ');
    seatLayerPickerAnnounce(undefined);
    expect(state.announced).toEqual([]);
  });
});
