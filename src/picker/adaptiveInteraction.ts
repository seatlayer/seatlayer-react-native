import { useLayoutEffect, useRef } from 'react';

import type { SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { seatLayerPickerTokens } from './tokens.g';

type InteractionLease = Readonly<{
  readonly controller: SeatLayerPickerScopeValue['controller'];
  readonly sessionId: number;
  readonly runtimeSessionId: string | undefined;
  readonly enabled: boolean;
}>;

function canSetInteraction(controller: SeatLayerPickerScopeValue['controller']): boolean {
  return controller.mapController.isReady &&
    controller.mapController.supportsPickerCapability('native-chrome-contract-v1') &&
    controller.mapController.supportsPickerCommand('picker.setInteractionEnabled');
}

function interactionSupportKey(controller: SeatLayerPickerScopeValue['controller']): string {
  try {
    return `${controller.mapController.isReady ? 1 : 0}:${controller.mapController.supportsPickerCapability('native-chrome-contract-v1') ? 1 : 0}:${controller.mapController.supportsPickerCommand('picker.setInteractionEnabled') ? 1 : 0}`;
  } catch {
    return '0:0:0';
  }
}

export function seatLayerPickerAdaptiveUnlockDelay(reducedMotion: boolean): number {
  return reducedMotion ? 0 : seatLayerPickerTokens.motion.duration.exit;
}

/**
 * A buyer-owned overlay blocks the runtime map immediately. Releasing waits for
 * the generated exit window so a fading scrim cannot leak a tap to the map.
 */
export function useSeatLayerPickerAdaptiveInteraction(
  scope: SeatLayerPickerScopeValue,
  blocked: boolean,
): void {
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const runtimeSessionId = scope.snapshot?.sessionId;
  // Readiness and contract negotiation may change while a GA/table prompt remains open.
  const supportKey = interactionSupportKey(scope.controller);
  const latestRef = useRef<Pick<InteractionLease, 'controller' | 'sessionId' | 'runtimeSessionId'>>({
    controller: scope.controller,
    sessionId: scope.sessionId,
    runtimeSessionId,
  });
  const appliedRef = useRef<InteractionLease | undefined>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const identityRef = useRef(latestRef.current);
  useLayoutEffect(() => {
    const next = { controller: scope.controller, sessionId: scope.sessionId, runtimeSessionId };
    const previous = identityRef.current;
    const applied = appliedRef.current;
    if (timeoutRef.current !== undefined && (previous.controller !== next.controller || previous.sessionId !== next.sessionId || previous.runtimeSessionId !== next.runtimeSessionId)) {
      clearTimeout(timeoutRef.current); timeoutRef.current = undefined;
    }
    if (applied && (applied.controller !== next.controller || applied.sessionId !== next.sessionId || applied.runtimeSessionId !== next.runtimeSessionId)) {
      appliedRef.current = undefined;
      if (applied.controller !== next.controller) {
        void applied.controller.setInteractionEnabled(true).catch(() => undefined);
      } else if (applied.runtimeSessionId === next.runtimeSessionId) {
        appliedRef.current = Object.freeze({ ...applied, sessionId: next.sessionId });
      }
    }
    identityRef.current = next;
    latestRef.current = next;
  }, [runtimeSessionId, scope.controller, scope.sessionId]);
  useLayoutEffect(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    const controller = scope.controller;
    const sessionId = scope.sessionId;
    const current = () => latestRef.current.controller === controller && latestRef.current.sessionId === sessionId &&
      latestRef.current.runtimeSessionId === runtimeSessionId;
    const apply = (enabled: boolean) => {
      if (!current() || !canSetInteraction(controller)) return;
      const applied = appliedRef.current;
      if (applied?.controller === controller && applied.sessionId === sessionId && applied.runtimeSessionId === runtimeSessionId && applied.enabled === enabled) return;
      appliedRef.current = Object.freeze({ controller, sessionId, runtimeSessionId, enabled });
      void controller.setInteractionEnabled(enabled).catch(() => undefined);
    };
    if (blocked) {
      apply(false);
      return undefined;
    }
    const applied = appliedRef.current;
    if (applied?.controller !== controller || applied.sessionId !== sessionId || applied.runtimeSessionId !== runtimeSessionId || applied.enabled) {
      return undefined;
    }
    const release = () => { timeoutRef.current = undefined; apply(true); };
    const delay = seatLayerPickerAdaptiveUnlockDelay(reducedMotion);
    if (delay <= 0) release();
    else timeoutRef.current = setTimeout(release, delay);
    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, [blocked, reducedMotion, runtimeSessionId, scope.controller, scope.sessionId, supportKey]);
  useLayoutEffect(() => () => {
    if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
    const applied = appliedRef.current;
    const current = latestRef.current;
    if (applied && !applied.enabled && applied.controller === current.controller && applied.sessionId === current.sessionId && applied.runtimeSessionId === current.runtimeSessionId) {
      appliedRef.current = undefined;
      void applied.controller.setInteractionEnabled(true).catch(() => undefined);
    }
  }, []);
}
