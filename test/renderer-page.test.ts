import { describe, expect, it } from 'vitest';

import {
  isSeatLayerRendererMessageSource,
  seatLayerRendererAllowsNavigation,
} from '../src/rendererMessageSource';
import { seatLayerHostedWebVersion, seatLayerMobileOrigin, seatLayerMobilePageUrl } from '../src/types';

const second = `${seatLayerMobileOrigin}/seatlayer-js@${seatLayerHostedWebVersion}/season.html`;

describe('a renderer for another page of the same map version', () => {
  it('opens only the page it was given', () => {
    expect(seatLayerRendererAllowsNavigation(second, second)).toBe(true);
    expect(seatLayerRendererAllowsNavigation(second, seatLayerMobilePageUrl)).toBe(false);
    expect(seatLayerRendererAllowsNavigation(second, `${second}?x=1`)).toBe(false);
    expect(seatLayerRendererAllowsNavigation(second, 'https://example.com/season.html')).toBe(false);
  });

  it('hears that page, and the origin as Android names it', () => {
    expect(isSeatLayerRendererMessageSource(second, second)).toBe(true);
    expect(isSeatLayerRendererMessageSource(seatLayerMobileOrigin, second)).toBe(true);
    expect(isSeatLayerRendererMessageSource(`${seatLayerMobileOrigin}/`, second)).toBe(true);
    expect(isSeatLayerRendererMessageSource(seatLayerMobilePageUrl, second)).toBe(false);
  });

  it('is the event page when no page is given', () => {
    expect(seatLayerRendererAllowsNavigation(seatLayerMobilePageUrl, seatLayerMobilePageUrl)).toBe(true);
    expect(seatLayerRendererAllowsNavigation(undefined, seatLayerMobilePageUrl)).toBe(true);
    expect(seatLayerRendererAllowsNavigation(undefined, second)).toBe(false);
    expect(isSeatLayerRendererMessageSource(seatLayerMobilePageUrl)).toBe(true);
    expect(isSeatLayerRendererMessageSource(second)).toBe(false);
  });

  it('never opens a page off the map origin, whatever it is given', () => {
    const elsewhere = 'https://example.com/seatlayer-js/season.html';
    expect(seatLayerRendererAllowsNavigation(elsewhere, elsewhere)).toBe(false);
    expect(isSeatLayerRendererMessageSource(elsewhere, elsewhere)).toBe(false);
  });
});
