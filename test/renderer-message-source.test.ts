import { describe, expect, it } from 'vitest';

import { isSeatLayerRendererMessageSource } from '../src/rendererMessageSource';
import { seatLayerMobileOrigin, seatLayerMobilePageUrl } from '../src/types';

describe('SeatLayer renderer message source', () => {
  it('accepts the full iOS document URL and Android origin-only URL', () => {
    expect(isSeatLayerRendererMessageSource(seatLayerMobilePageUrl)).toBe(true);
    expect(isSeatLayerRendererMessageSource(seatLayerMobileOrigin)).toBe(true);
    expect(isSeatLayerRendererMessageSource(`${seatLayerMobileOrigin}/`)).toBe(true);
  });

  it('rejects every other origin, path, and empty source', () => {
    expect(isSeatLayerRendererMessageSource('')).toBe(false);
    expect(isSeatLayerRendererMessageSource('https://cdn.seatlayer.io/other.html')).toBe(false);
    expect(isSeatLayerRendererMessageSource(`${seatLayerMobilePageUrl}?unexpected=1`)).toBe(false);
    expect(isSeatLayerRendererMessageSource('https://cdn.seatlayer.io.attacker.example')).toBe(false);
    expect(isSeatLayerRendererMessageSource('https://example.com')).toBe(false);
  });
});
