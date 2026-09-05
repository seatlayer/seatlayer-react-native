import { describe, expect, it } from 'vitest';

import {
  resetSeatLayerPickerImmersiveBlur,
  seatLayerPickerImmersiveBlurAvailable,
  seatLayerPickerImmersiveCaptionGlass,
  seatLayerPickerImmersiveGlass,
} from '../src/picker/immersiveGlass';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const dark = seatLayerPickerTokens.color.dark;
const size = seatLayerPickerTokens.size;
const strings = seatLayerPickerTokens.strings;

describe('§3.14 one dark glass, mixed once', () => {
  it('reads the ground, hairline, ink and blur straight off the dark tokens', () => {
    expect(seatLayerPickerImmersiveGlass).toEqual({
      ground: dark.immersiveGlass,
      border: dark.immersiveGlassBorder,
      ink: dark.immersiveGlassInk,
      blurRadius: size.immersiveGlassBlur,
    });
    expect(seatLayerPickerImmersiveCaptionGlass).toEqual({
      ground: dark.immersiveCaption,
      border: dark.immersiveCaptionBorder,
      ink: dark.immersiveCaptionInk,
      blurRadius: size.immersiveCaptionBlur,
    });
    expect(size.immersiveGlassBlur).toBe(6);
    expect(size.immersiveCaptionBlur).toBe(8);
  });

  it('degrades to the ground colour where no blur module is installed', () => {
    resetSeatLayerPickerImmersiveBlur();
    // The SDK never makes a host install a blur; absence is not a failure.
    expect(seatLayerPickerImmersiveBlurAvailable()).toBe(false);
    expect(seatLayerPickerImmersiveGlass.ground).toMatch(/^#[0-9A-Fa-f]{8}$/);
  });

  it('carries the deck and back-pill sizes the spec names', () => {
    expect(size.immersiveBackPillHeight).toBe(44);
    expect(size.immersiveBackFontSize).toBe(11);
    expect(size.immersiveBackIconSize).toBe(15);
    expect(size.immersiveNavChipHeight).toBe(32);
    expect(size.immersiveNavChipPaddingX).toBe(12);
    expect(size.immersiveNavChipFontSize).toBe(12.5);
    expect(size.immersiveNavCloseSize).toBe(32);
    expect(size.immersiveCaptionFontSize).toBe(11.5);
  });

  it('names the deck and the seat-view strip from the generated strings', () => {
    expect(strings.backToVenue).toBe('Back to venue');
    expect(strings.openVenue360).toBe('Open venue 360°');
    expect(strings.previousSeat).toBe('Previous seat');
    expect(strings.nextSeat).toBe('Next seat');
    expect(strings.recentre).toBe('Recentre the view');
    expect(strings.orbitMode).toBe('Rotate venue');
    expect(strings.panMode).toBe('Move venue');
    expect(strings.viewFromYourSeat).toBe('view from your seat');
  });
});
