import { useEffect, useRef } from 'react';

import { SeatLayerController } from './controller';

export function useSeatLayerController(): SeatLayerController {
  const controller = useRef<SeatLayerController | null>(null);
  if (!controller.current) controller.current = new SeatLayerController();
  useEffect(() => {
    const current = controller.current;
    return () => current?.dispose();
  }, []);
  return controller.current;
}
