import { seatLayerMobileOrigin, seatLayerMobilePageUrl } from './types';

/**
 * Android reports a WebView postMessage source as its origin, while iOS can
 * report the full document URL. Top-level navigation is independently locked
 * to the pinned mobile page by SeatLayerRenderer.
 */
export function isSeatLayerRendererMessageSource(sourceUrl: string): boolean {
  return sourceUrl === seatLayerMobilePageUrl
    || sourceUrl === seatLayerMobileOrigin
    || sourceUrl === `${seatLayerMobileOrigin}/`;
}
