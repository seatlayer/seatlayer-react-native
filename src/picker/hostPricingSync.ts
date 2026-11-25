import { useEffect, useRef } from 'react';

import type { SeatLayerPickerController } from './controller';
import { seatLayerHostPricesPayload } from './hostPricing';
import type { SeatLayerPickerPricing } from './options';

/**
 * A page boots with the prices it was opened with. New ones reach it as they
 * come, and again when another page takes its place.
 */
export function useSeatLayerHostPricingSync({
  boot, controller, isReady, onError, pricing, session,
}: Readonly<{
  boot: unknown;
  controller: SeatLayerPickerController;
  isReady: boolean;
  onError: (error: unknown) => void;
  pricing: SeatLayerPickerPricing | undefined;
  session: string | undefined;
}>): void {
  const wanted = JSON.stringify(seatLayerHostPricesPayload(pricing));
  const booted = JSON.stringify(boot ?? null);
  const told = useRef<Readonly<{ session: string | undefined; prices: string }>>(
    { session: undefined, prices: booted },
  );
  const latest = useRef(pricing);
  latest.current = pricing;
  useEffect(() => {
    if (!isReady) return;
    const known = told.current.session === session ? told.current.prices : booted;
    told.current = { session, prices: wanted };
    if (known === wanted) return;
    void controller.setPricing(latest.current ?? null).catch(onError);
  }, [booted, controller, isReady, onError, session, wanted]);
}
