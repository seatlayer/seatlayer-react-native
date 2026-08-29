import { useEffect, useLayoutEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
/**
 * Navigation-neutral Android adapter.  BackHandler requires a synchronous
 * result, so it consumes only a rung that is already known to be local.  The
 * scope still owns the actual one-rung transition and command de-duplication.
 */
export function useSeatLayerPickerHardwareBack(enabled = true): void {
  const scope = useSeatLayerPickerScope();
  const latestRef = useRef(scope);
  // The registration remains stable while React catches up with a snapshot;
  // each press reads scope's synchronous snapshot/pending/coordinator state.
  useLayoutEffect(() => { latestRef.current = scope; }, [scope]);
  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const latest = latestRef.current;
      if (!latest.canHandleBack()) return false;
      void latest.back();
      return true;
    });
    return () => subscription.remove();
  }, [enabled]);
}

/** Registers the shared scope back ladder without taking a visual slot. */
export function SeatLayerPickerScopeBackHandler({
  enabled = true,
}: {
  readonly enabled?: boolean;
}): null {
  useSeatLayerPickerHardwareBack(enabled);
  return null;
}
