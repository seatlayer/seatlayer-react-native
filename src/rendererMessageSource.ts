import { seatLayerMobileOrigin, seatLayerMobilePageUrl } from './types';

/** The page a renderer opens: the one it was given, on the map's origin only. */
function rendererPage(page: string | undefined): string | undefined {
  const chosen = page ?? seatLayerMobilePageUrl;
  return chosen.startsWith(`${seatLayerMobileOrigin}/`) ? chosen : undefined;
}

/**
 * Whether the renderer may load `url` as its main document: its own page, by
 * its exact address, and nothing else.
 */
export function seatLayerRendererAllowsNavigation(page: string | undefined, url: string): boolean {
  const own = rendererPage(page);
  return own !== undefined && url === own;
}

/**
 * Android reports a WebView postMessage source as its origin, while iOS can
 * report the full document URL. Top-level navigation is independently locked
 * to the renderer's own page by SeatLayerRenderer.
 */
export function isSeatLayerRendererMessageSource(sourceUrl: string, page?: string): boolean {
  const own = rendererPage(page);
  if (own === undefined) return false;
  return sourceUrl === own
    || sourceUrl === seatLayerMobileOrigin
    || sourceUrl === `${seatLayerMobileOrigin}/`;
}
