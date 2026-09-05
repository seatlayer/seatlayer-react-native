import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  reduceSeatLayerPickerHapticSnapshot,
  resetSeatLayerPickerHapticPolicy,
} from '../src/picker/haptics';
import { createSeatLayerPickerHapticPlayer } from '../src/picker/hapticPlayer';
import { seatLayerPickerHapticChannel } from '../src/picker/hapticChannel';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const directory = new URL('../src/picker/', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, directory), 'utf8');

describe('§4.5 the haptics gate', () => {
  it('decides WHICH cue in a pure policy that knows nothing about a platform', () => {
    const policy = read('haptics.ts');
    expect(policy).not.toContain("from 'react-native'");
    // It names cues; it never reaches a motor.
    expect(policy).not.toMatch(/HapticFeedback|impactAsync|Vibration|NativeModules/);
    // Its only import is the generated token set that names the vocabulary.
    expect(policy).toContain("from './tokens.g'");
  });

  it('fires nothing on the first snapshot of a session — the seeding rule', () => {
    const seeded = reduceSeatLayerPickerHapticSnapshot(resetSeatLayerPickerHapticPolicy(), {
      selectionCount: 3, focusedSectionId: '205', hasHold: true,
    });
    expect(seeded.cues).toEqual([]);
    // And the very next change speaks, so silence is seeding, not muting.
    expect(reduceSeatLayerPickerHapticSnapshot(seeded.state, {
      selectionCount: 4, focusedSectionId: '205', hasHold: true,
    }).cues).toEqual(['selectionAdded']);
  });

  it('resets its history with the session, so a remount never replays a cue', () => {
    expect(resetSeatLayerPickerHapticPolicy().seeded).toBe(false);
  });

  it('swallows a platform failure where the channel is called, not where the cue was asked for', async () => {
    const player = createSeatLayerPickerHapticPlayer({
      play: () => Promise.reject(new Error('no motor')),
    });
    // The caller's promise RESOLVES: nothing that depends on the buyer's seats
    // may fail because a phone declined to buzz.
    await expect(player.play('selectionAdded')).resolves.toBeUndefined();
    await expect(player.play('holdExpired')).resolves.toBeUndefined();
  });

  it('is silent where the host switched it off — no adapter, no channel, no error', () => {
    const controller = {};
    const channel = seatLayerPickerHapticChannel(controller);
    expect(() => channel.emit('selectionAdded')).not.toThrow();
    // The same controller keeps the same channel, so a cue emitted under the
    // finger reaches whatever participant is listening — and nothing when none is.
    expect(seatLayerPickerHapticChannel(controller)).toBe(channel);
  });

  it('lets one broken listener never stop the rest', () => {
    const channel = seatLayerPickerHapticChannel({});
    const heard: string[] = [];
    channel.subscribe(() => { throw new Error('bad listener'); });
    channel.subscribe((cue) => { heard.push(cue); });
    channel.emit('ticketRemoved');
    expect(heard).toEqual(['ticketRemoved']);
  });

  it('names every strength the way the design tokens name it', () => {
    const cues = Object.keys(seatLayerPickerTokens.haptics).filter((key) => key !== 'note');
    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) {
      expect(typeof (seatLayerPickerTokens.haptics as Record<string, unknown>)[cue]).toBe('string');
    }
  });

  it('reads the host switch at the composition root, beside the adapter', () => {
    expect(read('SeatLayerPickerAdaptiveLayout.tsx')).toContain('plan.options.haptics && hapticAdapter');
  });
});
