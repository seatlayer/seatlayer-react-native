import { seatLayerPickerTokens } from './tokens.g';
import type { SeatLayerPickerHapticCue } from './haptics';

export type SeatLayerPickerHapticStrength = typeof seatLayerPickerTokens.haptics[SeatLayerPickerHapticCue];

export interface SeatLayerPickerHapticAdapter {
  play(strength: SeatLayerPickerHapticStrength): void | Promise<void>;
}

export interface SeatLayerPickerHapticPlayer {
  play(cue: SeatLayerPickerHapticCue): Promise<void>;
}

export function getSeatLayerPickerHapticStrength(
  cue: SeatLayerPickerHapticCue,
): SeatLayerPickerHapticStrength {
  return seatLayerPickerTokens.haptics[cue];
}

/** Adapter failures are intentionally contained so haptics cannot reject picker work. */
export function createSeatLayerPickerHapticPlayer(
  adapter: SeatLayerPickerHapticAdapter,
  isActive: () => boolean = () => true,
): SeatLayerPickerHapticPlayer {
  let tail = Promise.resolve();
  return {
    play(cue) {
      const play = tail.then(async () => {
        if (!isActive()) return;
        try { await adapter.play(getSeatLayerPickerHapticStrength(cue)); } catch { /* Optional feedback never rejects picker work. */ }
      });
      tail = play.catch(() => {});
      return play;
    },
  };
}
