import type { SeatLayerPickerHapticCue } from './haptics';

type Listener = (cue: SeatLayerPickerHapticCue) => void;

/**
 * The picker's imperative cue channel, one per controller.
 *
 * Most haptics are read off the snapshot, but a gesture whose whole point is
 * that it is felt UNDER THE FINGER cannot wait for a snapshot: the removal cue
 * has to be played before `picker.removeCartLine` is even sent. Surfaces emit
 * here; the haptics participant is what listens, so a picker mounted without
 * an adapter simply drops the cue.
 */
export class SeatLayerPickerHapticChannel {
  private readonly listeners = new Set<Listener>();

  emit = (cue: SeatLayerPickerHapticCue): void => {
    for (const listener of [...this.listeners]) {
      try { listener(cue); } catch { /* one broken listener never stops the rest */ }
    }
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
}

const channels = new WeakMap<object, SeatLayerPickerHapticChannel>();

/** The one channel for a controller, created on first use. */
export function seatLayerPickerHapticChannel(controller: object): SeatLayerPickerHapticChannel {
  const held = channels.get(controller);
  if (held !== undefined) return held;
  const created = new SeatLayerPickerHapticChannel();
  channels.set(controller, created);
  return created;
}
