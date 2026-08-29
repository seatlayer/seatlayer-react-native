import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const publicIndex = new URL('../src/index.ts', import.meta.url);

describe('picker public API', () => {
  it('exports all three integration levels and the standalone chrome explicitly', async () => {
    const source = await readFile(publicIndex, 'utf8');
    const required = [
      'SeatLayerPicker',
      'SeatLayerPickerModal',
      'SeatLayerPickerAdaptiveLayout',
      'SeatLayerPickerOptions',
      'SeatLayerPickerThemeData',
      'SeatLayerPickerStyles',
      'SeatLayerPickerBuilders',
      'SeatLayerPickerCallbacks',
      'SeatLayerPickerScope',
      'useSeatLayerPicker',
      'SeatLayerPickerController',
      'SeatLayerPickerSnapshot',
      'SeatLayerChart',
      'SeatLayerPickerHeader',
      'SeatLayerPriceLegend',
      'SeatLayerDockBar',
      'SeatLayerConfirmCard',
      'SeatLayerCartSheet',
      'SeatLayerFloorStrip',
      'SeatLayerMapControls',
      'SeatLayerVenue3D',
      'SeatLayerSeatViewChrome',
    ] as const;

    for (const name of required) expect(source).toMatch(new RegExp(`\\b${name}\\b`));
    expect(source).not.toMatch(/export\s*\*/);
  });

  it('keeps ownership, decoding, generated design, and shared wrapper internals private', async () => {
    const source = await readFile(publicIndex, 'utf8');
    for (const path of [
      './picker/SeatLayerPickerScopedContent',
      './picker/SeatLayerPickerCallbackObserver',
      './picker/closeLifecycle',
      './picker/decode',
      './picker/snapshot-store',
      './picker/strings.g',
      './picker/tokens.g',
    ]) {
      expect(source).not.toContain(path);
    }
  });
});
