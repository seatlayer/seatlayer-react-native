import { describe, expect, it, vi } from 'vitest';

import {
  SeatLayerPickerBlockedRegionRegistry,
  seatLayerPickerBlockedRegionCover,
  seatLayerPickerBlockedRegionFromRect,
  seatLayerPickerBlockedRegionLingerMs,
} from '../src/picker/blockedRegions';
import type { SeatLayerPickerBlockedRegion } from '../src/picker/models';

/** A scheduler that never runs on its own, so every frame is asked for. */
function frames() {
  const queue: Array<() => void> = [];
  return {
    scheduler: {
      requestAnimationFrame(callback: () => void) {
        queue.push(callback);
        return queue.length;
      },
      cancelAnimationFrame(handle: unknown) {
        const index = (handle as number) - 1;
        if (index >= 0 && index < queue.length) queue[index] = () => undefined;
      },
    },
    pending: () => queue.length,
    async draw() {
      const pending = queue.splice(0, queue.length);
      for (const callback of pending) callback();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function registry(supported = true) {
  const clock = { now: 0 };
  const timers: Array<{ at: number; run: () => void }> = [];
  const sink = vi.fn(
    async (_regions: readonly SeatLayerPickerBlockedRegion[] | null) => undefined,
  );
  const draw = frames();
  const instance = new SeatLayerPickerBlockedRegionRegistry({
    scheduler: draw.scheduler,
    sink,
    supported: () => supported,
    now: () => clock.now,
    setTimer: (callback, ms) => {
      const entry = { at: clock.now + ms, run: callback };
      timers.push(entry);
      return entry;
    },
    clearTimer: (handle) => {
      const index = timers.indexOf(handle as (typeof timers)[number]);
      if (index >= 0) timers.splice(index, 1);
    },
  });
  return {
    instance,
    sink,
    clock,
    draw,
    advance(ms: number) {
      clock.now += ms;
      for (const entry of timers.splice(0, timers.length)) {
        if (entry.at <= clock.now) entry.run();
        else timers.push(entry);
      }
    },
  };
}

const surface = { x: 0, y: 120, width: 390, height: 500 };

describe('blocked-region geometry', () => {
  it('reports in the map surface frame, the same frame as the insets', () => {
    expect(seatLayerPickerBlockedRegionFromRect(
      { x: 330, y: 800, width: 44, height: 44 },
      surface,
    )).toEqual({ x: 330, y: 680, w: 44, h: 44 });
  });

  it('drops a rectangle with no surface, no size, or a non-finite side', () => {
    expect(seatLayerPickerBlockedRegionFromRect({ x: 1, y: 1, width: 4, height: 4 }, undefined))
      .toBeUndefined();
    expect(seatLayerPickerBlockedRegionFromRect({ x: 1, y: 1, width: 0, height: 4 }, surface))
      .toBeUndefined();
    expect(seatLayerPickerBlockedRegionFromRect(
      { x: Number.NaN, y: 1, width: 4, height: 4 }, surface,
    )).toBeUndefined();
  });

  it('covers the whole surface for a modal over the page', () => {
    expect(seatLayerPickerBlockedRegionCover(surface)).toEqual({ x: 0, y: 0, w: 390, h: 500 });
  });
});

describe('blocked-region registry', () => {
  it('coalesces every control into one list per frame and replaces it whole', async () => {
    const host = registry();
    host.instance.setSurface(surface);
    const disc = host.instance.claim();
    const chip = host.instance.claim();
    disc.report({ x: 330, y: 800, width: 44, height: 44 });
    chip.report({ x: 12, y: 132, width: 96, height: 26 });
    expect(host.sink).not.toHaveBeenCalled();
    await host.draw.draw();
    expect(host.sink).toHaveBeenCalledTimes(1);
    expect(host.sink.mock.calls[0]![0]).toEqual([
      { x: 330, y: 680, w: 44, h: 44 },
      { x: 12, y: 12, w: 96, h: 26 },
    ]);
  });

  it('never sends the same list twice', async () => {
    const host = registry();
    host.instance.setSurface(surface);
    const disc = host.instance.claim();
    disc.report({ x: 330, y: 800, width: 44, height: 44 });
    await host.draw.draw();
    disc.report({ x: 330, y: 800, width: 44, height: 44 });
    await host.draw.draw();
    expect(host.sink).toHaveBeenCalledTimes(1);
  });

  it('asks for a frame for a report made outside one', async () => {
    const host = registry();
    host.instance.setSurface(surface);
    expect(host.draw.pending()).toBeGreaterThan(0);
    await host.draw.draw();
    const disc = host.instance.claim();
    disc.report({ x: 1, y: 121, width: 44, height: 44 });
    expect(host.draw.pending()).toBe(1);
  });

  it('keeps a departed control’s rectangle for 600 ms, then drops it', async () => {
    const host = registry();
    host.instance.setSurface(surface);
    const disc = host.instance.claim();
    disc.report({ x: 330, y: 800, width: 44, height: 44 });
    await host.draw.draw();
    disc.release();
    await host.draw.draw();
    expect(host.sink).toHaveBeenCalledTimes(1);
    host.advance(seatLayerPickerBlockedRegionLingerMs - 1);
    await host.draw.draw();
    expect(host.sink).toHaveBeenCalledTimes(1);
    host.advance(1);
    await host.draw.draw();
    expect(host.sink).toHaveBeenCalledTimes(2);
    expect(host.sink.mock.calls[1]![0]).toEqual([]);
  });

  it('sends nothing to a runtime whose hello table lacks the command', async () => {
    const host = registry(false);
    host.instance.setSurface(surface);
    host.instance.claim().report({ x: 330, y: 800, width: 44, height: 44 });
    await host.draw.draw();
    expect(host.sink).not.toHaveBeenCalled();
    host.instance.dispose();
    expect(host.sink).not.toHaveBeenCalled();
  });

  it('clears with [] when the composing layout leaves', async () => {
    const host = registry();
    host.instance.setSurface(surface);
    host.instance.claim().report({ x: 330, y: 800, width: 44, height: 44 });
    await host.draw.draw();
    host.instance.dispose();
    await Promise.resolve();
    expect(host.sink).toHaveBeenCalledTimes(2);
    expect(host.sink.mock.calls[1]![0]).toEqual([]);
  });

  it('re-measures every rectangle when the map surface moves', async () => {
    const host = registry();
    host.instance.setSurface(surface);
    host.instance.claim().report({ x: 330, y: 800, width: 44, height: 44 });
    await host.draw.draw();
    host.instance.setSurface({ ...surface, y: 100 });
    await host.draw.draw();
    expect(host.sink.mock.calls[1]![0]).toEqual([{ x: 330, y: 700, w: 44, h: 44 }]);
  });

  it('covers the whole map while a modal stands over the page', async () => {
    const host = registry();
    host.instance.setSurface(surface);
    const modal = host.instance.claimCover();
    modal.report(undefined);
    await host.draw.draw();
    expect(host.sink.mock.calls[0]![0]).toEqual([{ x: 0, y: 0, w: 390, h: 500 }]);
  });
});
