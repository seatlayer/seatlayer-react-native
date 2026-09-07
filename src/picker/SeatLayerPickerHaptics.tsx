import { useEffect, useRef } from 'react';

import { createSeatLayerPickerHapticPlayer, type SeatLayerPickerHapticAdapter } from './hapticPlayer';
import {
  reduceSeatLayerPickerHapticSnapshot,
  resetSeatLayerPickerHapticPolicy,
  signalSeatLayerPickerHoldExpired,
  type SeatLayerPickerHapticPolicyState,
} from './haptics';
import { seatLayerPickerHapticChannel } from './hapticChannel';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';

export interface SeatLayerPickerHapticsProps {
  /** Optional adapter: apps may use Expo, bare RN, or no haptics at all. */
  readonly adapter?: SeatLayerPickerHapticAdapter;
}

/** Scoped, transition-based haptics with no mandatory native dependency. */
export function useSeatLayerPickerHaptics(adapter: SeatLayerPickerHapticAdapter | undefined): void {
  const scope = useSeatLayerPickerScope();
  const policy = useRef<SeatLayerPickerHapticPolicyState>(resetSeatLayerPickerHapticPolicy());
  const generation = useRef(0);
  const active = useRef(false);
  const player = useRef<ReturnType<typeof createSeatLayerPickerHapticPlayer> | undefined>(undefined);
  useEffect(() => {
    generation.current += 1; active.current = true; policy.current = resetSeatLayerPickerHapticPolicy();
    const currentGeneration = generation.current;
    const currentPlayer = adapter === undefined
      ? undefined
      : createSeatLayerPickerHapticPlayer(adapter, () => active.current && generation.current === currentGeneration);
    player.current = currentPlayer;
    const currentSnapshot = scope.snapshot;
    if (currentSnapshot !== undefined) {
      policy.current = reduceSeatLayerPickerHapticSnapshot(policy.current, {
        selectionCount: currentSnapshot.selection.length,
        focusedSectionId: currentSnapshot.map.focusedSectionId,
        hasHold: currentSnapshot.hold.active,
      }).state;
    }
    const play = (cues: readonly Parameters<NonNullable<typeof currentPlayer>['play']>[0][]) => {
      if (!active.current || generation.current !== currentGeneration) return;
      for (const cue of cues) void currentPlayer?.play(cue);
    };
    const expired = scope.controller.mapController.on('holdExpired', () => {
      if (!active.current || generation.current !== currentGeneration) return;
      const result = signalSeatLayerPickerHoldExpired(policy.current);
      policy.current = result.state; play(result.cues);
    });
    const cued = seatLayerPickerHapticChannel(scope.controller).subscribe((cue) => {
      play([cue]);
    });
    return () => {
      active.current = false; generation.current += 1;
      if (player.current === currentPlayer) player.current = undefined;
      try { cued(); } catch { /* Channel cleanup cannot affect picker. */ }
      try { expired(); } catch { /* Native listener cleanup cannot affect picker. */ }
    };
  }, [adapter, scope.controller, scope.sessionId]);
  useEffect(() => {
    if (!active.current || scope.snapshot === undefined) return;
    const result = reduceSeatLayerPickerHapticSnapshot(policy.current, {
      selectionCount: scope.snapshot.selection.length,
      focusedSectionId: scope.snapshot.map.focusedSectionId,
      hasHold: scope.snapshot.hold.active,
    });
    policy.current = result.state;
    for (const cue of result.cues) void player.current?.play(cue);
  }, [scope.snapshot]);
}

/** Non-visual standalone scope participant for a ready-made or custom picker. */
export function SeatLayerPickerHaptics({ adapter }: SeatLayerPickerHapticsProps): null {
  useSeatLayerPickerHaptics(adapter);
  return null;
}
