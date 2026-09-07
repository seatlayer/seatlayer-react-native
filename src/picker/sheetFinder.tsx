import React, { createContext, useContext, type PropsWithChildren } from 'react';

/**
 * The empty cart's door into the best-seats form (spec §3.10.3, ladder 7).
 *
 * ONE BUTTON, TWO DOORS: the foot's own button offers the finder instead of a
 * disabled label whenever the cart is empty on a surface that can show the
 * form. The form lives INSIDE the open sheet, so the press has to open the
 * sheet — which only the sheet can do.
 *
 * The sheet publishes that here so a HOST-SUPPLIED checkout bar keeps the door.
 * Passing the whole footer in is the documented way to restyle it, and a button
 * built outside the sheet has no handle on the sheet's own detent. A button
 * drawn where no sheet is mounted — the wide layout's bar — reads `undefined`
 * and falls back to the disabled `Select seats`, which is the right answer on a
 * width that shows the map beside the panel.
 */
const SeatLayerSheetFinderContext = createContext<(() => void) | undefined>(undefined);

export interface SeatLayerSheetFinderProviderProps extends PropsWithChildren {
  /** Opens the sheet on the best-seats form, or undefined where there is none. */
  readonly onFindBestSeats: (() => void) | undefined;
}

export function SeatLayerSheetFinderProvider(
  props: SeatLayerSheetFinderProviderProps,
): React.ReactElement {
  return (
    <SeatLayerSheetFinderContext.Provider value={props.onFindBestSeats}>
      {props.children}
    </SeatLayerSheetFinderContext.Provider>
  );
}

export function useSeatLayerSheetFinder(): (() => void) | undefined {
  return useContext(SeatLayerSheetFinderContext);
}
