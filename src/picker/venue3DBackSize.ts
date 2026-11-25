import { createContext } from 'react';

/** Told how large the 3D scene's way back is drawn, with what shares its line. */
export const SeatLayerVenue3DBackSizeContext = createContext<
  ((size: Readonly<{ width: number; height: number }>) => void) | undefined
>(undefined);
