import { seatLayerMobileOrigin, seatLayerMobilePageUrl } from './types';

/** The folder of the map version this release is pinned to, with its trailing slash. */
const versionFolder = seatLayerMobilePageUrl.slice(0, seatLayerMobilePageUrl.lastIndexOf('/') + 1);

/**
 * The page a renderer opens: the one it was given, and only a page file in
 * the folder of the pinned map version. Another version, another folder, a
 * `..`, a query or a fragment is no page at all.
 */
function rendererPage(page: string | undefined): string | undefined {
  const chosen = page ?? seatLayerMobilePageUrl;
  if (!chosen.startsWith(versionFolder)) return undefined;
  return /^[A-Za-z0-9_-]+\.html$/.test(chosen.slice(versionFolder.length)) ? chosen : undefined;
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
