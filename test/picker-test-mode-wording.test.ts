import { describe, expect, it } from 'vitest';
import { createSeatLayerPickerStringResolver, translateSeatLayerPickerString } from '../src/picker/locale';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

describe('§3.4 test-mode wording', () => {
  it('reads the default string, and a dictionary only for an explicit locale', () => {
    expect(translateSeatLayerPickerString('testMode')).toBe(seatLayerPickerTokens.strings.testMode);
    expect(createSeatLayerPickerStringResolver().translate('testMode'))
      .toBe(seatLayerPickerTokens.strings.testMode);
    expect(createSeatLayerPickerStringResolver({ locale: 'fr' }).translate('testMode'))
      .not.toBe(seatLayerPickerTokens.strings.testMode);
  });
});
