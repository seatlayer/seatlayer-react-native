import { describe, expect, it } from 'vitest';

import { SeatLayerPickerSeatLift } from '../src/picker/seatLift';

// The page answers the pan it ASKED its map for, and the map stops at its
// edge. The spotlight stands where the seat is, not where it was asked to go.

class Clock {
  private readonly pending = new Map<number, { at: number; run: () => void }>();
  private sequence = 0;
  now = 0;
  setTimeout = (run: () => void, ms: number): unknown => {
    const handle = ++this.sequence;
    this.pending.set(handle, { at: this.now + ms, run });
    return handle;
  };
  clearTimeout = (handle: unknown): void => { this.pending.delete(handle as number); };
  advance(ms: number): void {
    this.now += ms;
    for (const [handle, entry] of [...this.pending].sort((a, b) => a[1].at - b[1].at)) {
      if (entry.at <= this.now) { this.pending.delete(handle); entry.run(); }
    }
  }
}

const settle = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

/** A map whose seat stands at `from` and cannot rise above `edge`. */
function mapOf(from: number, edge: number) {
  const map = { at: from, least: edge, asked: [] as number[] };
  const clock = new Clock();
  const lift = new SeatLayerPickerSeatLift({
    frameSeat: async (_seatId, options) => {
      const dy = Math.round(60 + (844 - 60) * (options.fraction ?? 0) - map.at);
      map.asked.push(dy);
      map.at = Math.max(map.least, map.at + dy);
      return { dy: Math.abs(dy) < 2 ? 0 : dy, gestures: 2 };
    },
  }, clock);
  const show = async (revision = 1, seatId = 's1') => {
    for (let index = 0; index < 2; index += 1) {
      lift.sync({ seatId, mapHeight: 844, top: 60, bottom: 0, sheet: 300, revision });
    }
    await settle();
  };
  /** Up to `ms` later, every ask on the way answered. */
  const wait = async (ms: number) => {
    for (let step = 0; step < ms; step += 50) {
      clock.advance(50);
      await settle();
    }
  };
  return { map, lift, show, wait, rest: () => wait(3_000) };
}

describe('§3.8.2 where the seat is under the pan', () => {
  it('a map that could move', async () => {
    const { map, lift, show, rest } = mapOf(500, 0);
    await show();
    expect(lift.anchorDy).toBeCloseTo(map.at - 500, 0);
    await rest();
    expect(lift.anchorDy).toBeCloseTo(map.at - 500, 0);
    expect(lift.dy).toBeCloseTo(map.at - 500, 0);
  });

  it('a map that stopped at its edge', async () => {
    const { map, lift, show, rest } = mapOf(500, 465);
    await show();
    await rest();
    expect(map.at).toBe(465);
    expect(lift.anchorDy).toBeCloseTo(-35, 0);
    expect(lift.dy).toBeCloseTo(-35, 0);
  });

  it('a map that could not move at all', async () => {
    const { map, lift, show, rest } = mapOf(500, 500);
    await show();
    await rest();
    expect(lift.anchorDy).toBeCloseTo(0, 0);
    // Nothing was moved, so nothing is put back.
    const before = map.asked.length;
    lift.release();
    await settle();
    expect(map.asked).toHaveLength(before);
  });

  it('a map that let go of its edge later', async () => {
    const { map, lift, show, wait, rest } = mapOf(500, 465);
    await show();
    await wait(400);
    expect(lift.anchorDy).toBeCloseTo(-35, 0);
    map.least = 0;
    await rest();
    expect(lift.anchorDy).toBeCloseTo(map.at - 500, 0);
    expect(map.at).toBeLessThan(400);
  });

  it('a map put back by its own refit, before it was seen to arrive', async () => {
    const { map, lift, show, rest } = mapOf(500, 0);
    await show();
    map.at = 500;
    await rest();
    expect(map.at).toBeLessThan(400);
    expect(lift.anchorDy).toBeCloseTo(map.at - 500, 0);
  });

  it('a map put back by its own refit, after it arrived', async () => {
    const { map, lift, show, wait, rest } = mapOf(500, 0);
    await show();
    await wait(400);
    map.at = 500;
    await rest();
    expect(map.at).toBeLessThan(400);
    expect(lift.anchorDy).toBeCloseTo(map.at - 500, 0);
  });

  it('a newer snapshot already says where the seat is', async () => {
    const free = mapOf(500, 0);
    await free.show();
    await free.rest();
    await free.show(2);
    expect(free.lift.anchorDy).toBe(0);
    // At its edge, too.
    const edge = mapOf(500, 465);
    await edge.show();
    await edge.rest();
    await edge.show(2);
    expect(edge.lift.anchorDy).toBe(0);
    await edge.rest();
    expect(edge.lift.anchorDy).toBe(0);
  });

  it('another seat, on a map at its edge', async () => {
    const { map, lift, show, rest } = mapOf(500, 465);
    await show();
    await rest();
    map.at = 520;
    map.least = 520;
    await show(2, 's2');
    await rest();
    expect(lift.anchorDy).toBeCloseTo(0, 0);
  });
});
