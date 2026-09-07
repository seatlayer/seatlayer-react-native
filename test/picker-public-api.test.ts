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
      'SeatLayerResolvedPickerTheme',
      'SeatLayerMapThemeData',
      'SeatLayerPickerStyles',
      'SeatLayerPickerStrings',
      'SeatLayerPickerBuilders',
      'SeatLayerPickerCallbacks',
      'SeatLayerPickerScope',
      'useSeatLayerPicker',
      'SeatLayerPickerController',
      'SeatLayerPickerSnapshot',
      'SeatLayerChart',
      'SeatLayerPickerMap',
      'SeatLayerPickerHeader',
      'SeatLayerPickerHoldCountdown',
      'SeatLayerPriceLegend',
      'SeatLayerDockBar',
      'SeatLayerConfirmCard',
      'SeatLayerCartSheet',
      'SeatLayerPickerSelectionTray',
      'SeatLayerFloorStrip',
      'SeatLayerMapControls',
      'SeatLayerPickerMapControls',
      'SeatLayerPickerViewModeControl',
      'SeatLayerPickerOverviewButton',
      'SeatLayerPickerZoomInButton',
      'SeatLayerPickerZoomOutButton',
      'SeatLayerPickerZoomToFitButton',
      'SeatLayerPickerViewModeButton',
      'SeatLayerPicker3DNavigationModeButton',
      'SeatLayerPickerColorblindButton',
      'SeatLayerPickerGeneralAdmissionPrompt',
      'SeatLayerPickerSeatViewButton',
      'SeatLayerPickerSeat3DButton',
      'SeatLayerPickerCheckoutBar',
      'SeatLayerPickerLoadingStatus',
      'SeatLayerPickerErrorStatus',
      'SeatLayerPickerEmptyView',
      'SeatLayerVenue3D',
      'SeatLayerSeatViewChrome',
      'SeatLayerAvailabilityRefresh',
      'SeatLayerRecovery',
      'seatLayerAvailabilityRefreshCapability',
      'resolveSeatLayerPickerMotion',
      'SeatLayerTicketLine',
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
