import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
}));

import {
  observeSeatLayerPickerMemoryPressure,
  SeatLayerRuntimePrewarm,
  seatLayerPickerPrewarmDefaultTtlMs,
  seatLayerPickerPrewarmFreshnessMs,
} from '../src/picker/prewarm';
import {
  reduceSeatLayerPickerReveal,
  seatLayerPickerAwaitingFraming,
  seatLayerPickerCanAdoptRuntime,
  seatLayerPickerInitialRevealState,
  seatLayerPickerRevealGraceMs,
  seatLayerPickerRevealed,
} from '../src/picker/chartBoot';
import { SeatLayerPickerLoadingSurface } from '../src/picker/loadingSurface';
import { resolveSeatLayerPickerOptions } from '../src/picker/options';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const page = 'https://cdn.example.test/seatlayer-js@0.80.3/mobile.html';

function clock() {
  let now = 1_000;
  const timers: Array<{ at: number; run: () => void }> = [];
  SeatLayerRuntimePrewarm.now = () => now;
  SeatLayerRuntimePrewarm.setTimer = (callback, ms) => {
    const entry = { at: now + ms, run: callback };
    timers.push(entry);
    return entry;
  };
  SeatLayerRuntimePrewarm.clearTimer = (handle) => {
    const index = timers.indexOf(handle as (typeof timers)[number]);
    if (index >= 0) timers.splice(index, 1);
  };
  return {
    advance(ms: number) {
      now += ms;
      for (const entry of timers.splice(0, timers.length)) {
        if (entry.at <= now) entry.run();
        else timers.push(entry);
      }
    },
  };
}

afterEach(() => {
  SeatLayerRuntimePrewarm.discardAll();
  SeatLayerRuntimePrewarm.now = () => Date.now();
  SeatLayerRuntimePrewarm.fetcher = undefined;
});

describe('4.7 step 1 — prewarm on a short TTL', () => {
  it('warms the page and its named assets exactly once', () => {
    clock();
    const fetcher = vi.fn(async () => undefined);
    SeatLayerRuntimePrewarm.fetcher = fetcher;
    SeatLayerRuntimePrewarm.start(page, { assets: ['https://cdn.example.test/a.js'] });
    SeatLayerRuntimePrewarm.start(page);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(SeatLayerRuntimePrewarm.warmUrls).toEqual([page]);
  });

  it('ignores a non-http document — a bundled fixture has nothing to gain', () => {
    const fetcher = vi.fn(async () => undefined);
    SeatLayerRuntimePrewarm.fetcher = fetcher;
    SeatLayerRuntimePrewarm.start('file:///assets/mobile.html');
    SeatLayerRuntimePrewarm.start('');
    expect(fetcher).not.toHaveBeenCalled();
    expect(SeatLayerRuntimePrewarm.warmUrls).toEqual([]);
  });

  it('releases an unclaimed page at its TTL', () => {
    const time = clock();
    SeatLayerRuntimePrewarm.fetcher = async () => undefined;
    SeatLayerRuntimePrewarm.start(page);
    time.advance(seatLayerPickerPrewarmDefaultTtlMs - 1);
    expect(SeatLayerRuntimePrewarm.claim(page)).toBeDefined();
    SeatLayerRuntimePrewarm.start(page);
    time.advance(seatLayerPickerPrewarmDefaultTtlMs);
    expect(SeatLayerRuntimePrewarm.claim(page)).toBeUndefined();
  });

  it('hands a page out once, so two pickers cannot both think they got it', () => {
    clock();
    SeatLayerRuntimePrewarm.fetcher = async () => undefined;
    SeatLayerRuntimePrewarm.start(page);
    expect(SeatLayerRuntimePrewarm.claim(page)?.fresh).toBe(true);
    expect(SeatLayerRuntimePrewarm.claim(page)).toBeUndefined();
  });

  it('reports a stale claim rather than lying about how warm it is', () => {
    const time = clock();
    SeatLayerRuntimePrewarm.fetcher = async () => undefined;
    SeatLayerRuntimePrewarm.start(page);
    time.advance(seatLayerPickerPrewarmFreshnessMs);
    expect(SeatLayerRuntimePrewarm.claim(page)).toMatchObject({ fresh: false });
  });

  it('refuses to hand out a page that failed to warm', async () => {
    clock();
    SeatLayerRuntimePrewarm.fetcher = async () => { throw new Error('offline'); };
    SeatLayerRuntimePrewarm.start(page);
    await Promise.resolve();
    await Promise.resolve();
    expect(SeatLayerRuntimePrewarm.claim(page)).toBeUndefined();
  });

  it('drops everything the moment the platform says memory is short', () => {
    clock();
    SeatLayerRuntimePrewarm.fetcher = async () => undefined;
    SeatLayerRuntimePrewarm.start(page);
    let fire = () => undefined as void;
    const stop = observeSeatLayerPickerMemoryPressure((listener) => {
      fire = listener;
      return () => undefined;
    });
    fire();
    expect(SeatLayerRuntimePrewarm.warmUrls).toEqual([]);
    stop();
  });
});

describe('4.7 step 2 — adopt after layout', () => {
  it('refuses to adopt before the picker has a size', () => {
    expect(seatLayerPickerCanAdoptRuntime(undefined)).toBe(false);
    expect(seatLayerPickerCanAdoptRuntime({ width: 0, height: 844 })).toBe(false);
    expect(seatLayerPickerCanAdoptRuntime({ width: 390, height: 0 })).toBe(false);
    expect(seatLayerPickerCanAdoptRuntime({ width: Number.NaN, height: 844 })).toBe(false);
    expect(seatLayerPickerCanAdoptRuntime({ width: 390, height: 844 })).toBe(true);
  });
});

describe('4.7 step 3 — reveal after framing', () => {
  const reduce = (...events: Parameters<typeof reduceSeatLayerPickerReveal>[1][]) =>
    events.reduce(reduceSeatLayerPickerReveal, seatLayerPickerInitialRevealState);

  it('holds the loading surface until the map is framed inside the chrome', () => {
    expect(seatLayerPickerRevealed(reduce('ready'))).toBe(false);
    expect(seatLayerPickerRevealed(reduce('ready', 'insetsReported'))).toBe(true);
  });

  it('ignores an inset report that lands before the runtime is ready', () => {
    const early = reduce('insetsReported');
    expect(early.framed).toBe(false);
    expect(seatLayerPickerRevealed(reduceSeatLayerPickerReveal(early, 'ready'))).toBe(false);
  });

  it('reveals on the backstop for a runtime that never answers', () => {
    expect(seatLayerPickerRevealGraceMs).toBe(700);
    expect(seatLayerPickerAwaitingFraming(reduce('ready'))).toBe(true);
    expect(seatLayerPickerRevealed(reduce('ready', 'graceLapsed'))).toBe(true);
    expect(seatLayerPickerAwaitingFraming(reduce('ready', 'graceLapsed'))).toBe(false);
  });

  it('starts again from the beginning when the runtime is reloaded', () => {
    expect(reduce('ready', 'insetsReported', 'reset')).toEqual(seatLayerPickerInitialRevealState);
  });

  it('keeps the reveal budget the spec states', () => {
    expect(seatLayerPickerTokens.motion.durationOutsideBudget.revealDelay).toBe(900);
    expect(seatLayerPickerTokens.motion.durationOutsideBudget.shellSweep).toBe(650);
  });
});

describe('3.13.1 the loading surface is a venue, not a spinner', () => {
  it('draws three concentric shells around a stage and announces the sentence', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerLoadingSurface, {
        theme: {
          colors: { accent: '#5B4B8A', background: '#FFFFFF' },
          fontFamily: 'Brand',
        } as never,
        strings: { translate: (key: string) => key } as never,
      }));
    });
    const root = renderer.root.findByProps({ testID: 'seatlayer-loading-surface' });
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityLabel).toBe('loading');
    const shells = renderer.root.findAllByType('View' as never)
      .filter((node) => Array.isArray(node.props.style) &&
        node.props.style.some((entry: unknown) =>
          typeof entry === 'object' && entry !== null && 'borderRadius' in entry &&
          (entry as Record<string, unknown>).borderRadius === 999));
    expect(shells).toHaveLength(3);
    // No spinner: the surface never mounts an ActivityIndicator.
    expect(renderer.root.findAllByType('ActivityIndicator' as never)).toHaveLength(0);
  });
});

describe('4.7 the host may name the event before the runtime does', () => {
  it('takes a trimmed eventName and treats blank as absent', () => {
    expect(resolveSeatLayerPickerOptions({ eventName: '  Z GEN  ' }).eventName).toBe('Z GEN');
    expect(resolveSeatLayerPickerOptions({ eventName: '   ' }).eventName).toBeUndefined();
    expect(resolveSeatLayerPickerOptions({}).eventName).toBeUndefined();
  });
});
