import React, { createContext, useContext, type PropsWithChildren } from 'react';

/**
 * Whether a selection chip is still flying toward the cart (spec §3.9, 0.9.1).
 *
 * THE COUNT HOLDS STILL WHILE THE CHIP IS IN THE AIR. The add choreography is
 * one sentence — chip flight, then the count and total swell 1.3× with an
 * accent blink, then the lift releases — and a total that jumped the moment the
 * seat was confirmed made the flight land on a number that had already changed.
 *
 * LANE BOUNDARY: the flight belongs to the seat card's lane. It publishes
 * `true` while a chip is in flight and `false` on the frame it lands; the
 * sheet's total line reads it here and fires its swell on the falling edge.
 * `SeatLayerCartSheet`'s own `cartLanding` prop overrides the context, for a
 * host that drives the choreography itself.
 */
const SeatLayerCartLandingContext = createContext(false);

export interface SeatLayerCartLandingProviderProps extends PropsWithChildren {
  /** True while a chip is in flight toward the cart. */
  readonly landing: boolean;
}

export function SeatLayerCartLandingProvider(
  props: SeatLayerCartLandingProviderProps,
): React.ReactElement {
  return (
    <SeatLayerCartLandingContext.Provider value={props.landing === true}>
      {props.children}
    </SeatLayerCartLandingContext.Provider>
  );
}

/** `false` where no flight is running, and where no provider is mounted. */
export function useSeatLayerCartLanding(): boolean {
  return useContext(SeatLayerCartLandingContext);
}
