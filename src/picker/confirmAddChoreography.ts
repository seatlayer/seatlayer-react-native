import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  seatLayerPickerConfirmAddInitial, seatLayerPickerConfirmAddReduce,
  seatLayerPickerConfirmMotionPlan, seatLayerPickerConfirmSwellMs,
  type SeatLayerPickerConfirmAddEvent, type SeatLayerPickerConfirmAddState,
} from './confirmCardMotion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';

export interface SeatLayerPickerConfirmAddChoreography {
  /** Where the choreography stands: what the lift and the foot both read. */
  readonly stage: SeatLayerPickerConfirmAddState;
  /** The press, the chip's landing, and a card dismissed without an answer. */
  readonly advance: (event: SeatLayerPickerConfirmAddEvent) => void;
  /** True while a chip is in the air, for `SeatLayerCartLandingProvider`. */
  readonly landing: boolean;
}

/**
 * §3.8.4/§3.9 — the add choreography, held in one place because three surfaces
 * read it: the map's lift, the chip, and the cart's foot.
 *
 * The order is press → landed → released, and the only beat this hook owns
 * itself is the last one: the swell runs for `motion.duration.bump` and its
 * ending is what releases the map. Under reduced motion there is no chip, so
 * the press has already released and the timer never runs.
 *
 * A card that goes away without an answer is owed nothing, so the caller
 * reports that too rather than letting a half-finished sentence hold the lift
 * for the rest of the session.
 */
export function useSeatLayerPickerConfirmAddChoreography(
  cardActive: boolean,
  sessionId: unknown,
): SeatLayerPickerConfirmAddChoreography {
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const plan = useMemo(() => seatLayerPickerConfirmMotionPlan(reducedMotion), [reducedMotion]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const [stage, setStage] = useState(seatLayerPickerConfirmAddInitial);
  const advance = useCallback((event: SeatLayerPickerConfirmAddEvent) => {
    setStage((current) => seatLayerPickerConfirmAddReduce(current, event, planRef.current));
  }, []);
  useEffect(() => {
    if (!stage.swelling) return undefined;
    const ms = seatLayerPickerConfirmSwellMs(plan);
    if (ms <= 0) { advance({ kind: 'swelled' }); return undefined; }
    const timer = setTimeout(() => advance({ kind: 'swelled' }), ms);
    return () => clearTimeout(timer);
  }, [advance, plan, stage.swelling]);
  // A new session is a new runtime; the choreography never carries across one.
  useEffect(() => {
    if (cardActive) return;
    advance({ kind: 'dismissed' });
  }, [advance, cardActive, sessionId]);
  return { advance, landing: stage.stage === 'flying', stage };
}
