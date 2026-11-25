import { asArray, asObject, asString } from '../json';

/**
 * The page answers ready also when the map did not load: no network, a server
 * that does not answer, an event that is not there. It then names the event by
 * its key and has no level and no price. A session that was refused has a
 * telling of its own and is left to it.
 */
export function seatLayerPickerMapDidNotLoad(snapshot: unknown): boolean {
  const root = asObject(snapshot);
  const event = asObject(root?.event);
  const key = asString(event?.key);
  if (key === undefined || asString(event?.name) !== key) return false;
  if (asArray(asObject(root?.map)?.floors).length > 0) return false;
  const catalog = asObject(root?.catalog);
  if (asArray(catalog?.categories).length > 0 || asArray(catalog?.gaAreas).length > 0) return false;
  const access = asObject(root?.access);
  const status = asString(access?.status);
  return (status !== 'unavailable' && status !== 'expired') ||
    (status === 'unavailable' && asString(access?.reason) === 'provider_failed');
}
