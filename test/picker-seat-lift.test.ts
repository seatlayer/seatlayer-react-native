import { describe, expect, it } from 'vitest';

import {
  SeatLayerPickerSeatLift,
  seatLayerPickerSeatCardInsetBand,
  seatLayerPickerSheetLiftFraction,
  seatLayerPickerSheetRestoreFraction,
  seatLayerPickerSheetSeatFraction,
  seatLayerPickerSheetSettleDelaysMs,
  type SeatLayerPickerSeatFrame,
} from '../src/picker/seatLift';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

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
    for (const [handle, entry] of [...this.pending]) {
      if (entry.at <= this.now) { this.pending.delete(handle); entry.run(); }
    }
  }
  get scheduled(): number { return this.pending.size; }
}

function sink(answers: (SeatLayerPickerSeatFrame | undefined)[] = []) {
  const calls: { seatId: string; fraction?: number; gestures?: number }[] = [];
  let index = 0;
  return {
    calls,
    frameSeat: async (seatId: string, options: { fraction?: number; gestures?: number }) => {
      calls.push({ seatId, ...options });
      const answer = answers[index] ?? { dy: -100, gestures: index + 1 };
      index += 1;
      return answer;
    },
  };
}

const settle = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };
const band = { mapHeight: 700, top: 60, bottom: 40, sheet: 300, revision: 1 } as const;

describe('§3.8.2 folding the sheet into the fraction', () => {
  it('is the web sheet’s 0.48 of the band the sheet leaves clear', () => {
    expect(seatLayerPickerSheetSeatFraction).toBeCloseTo(0.48, 5);
    // clear = 700 - 60 - 300 = 340; target = 163.2; band = 600 → 0.272
    expect(seatLayerPickerSheetLiftFraction(band)).toBeCloseTo(0.272, 5);
  });

  it('answers 0 where the chrome leaves no band, and clamps to it', () => {
    expect(seatLayerPickerSheetLiftFraction({ mapHeight: 100, top: 60, bottom: 60, sheet: 10 })).toBe(0);
    expect(seatLayerPickerSheetLiftFraction({ mapHeight: 400, top: 0, bottom: 0, sheet: 500 })).toBe(0);
    expect(seatLayerPickerSheetLiftFraction({ mapHeight: 400, top: 0, bottom: 300, sheet: 0, at: 1 })).toBe(1);
  });

  it('restores to the middle of the band, never to a sum of pans', () => {
    expect(seatLayerPickerSheetRestoreFraction).toBe(0.5);
  });
});

describe('§3.8.2 the settle rule', () => {
  it('sends nothing until two consecutive syncs agree on the map height', async () => {
    const target = sink();
    const lift = new SeatLayerPickerSeatLift(target, new Clock());
    lift.sync({ seatId: 's1', ...band });
    await settle();
    expect(lift.isSettling).toBe(true);
    expect(target.calls).toHaveLength(0);
    lift.sync({ seatId: 's1', ...band });
    await settle();
    expect(lift.isSettling).toBe(false);
    expect(target.calls).toHaveLength(1);
    expect(target.calls[0]?.fraction).toBeCloseTo(0.272, 5);
  });

  it('starts settling again when the map resizes mid-card', async () => {
    const target = sink();
    const lift = new SeatLayerPickerSeatLift(target, new Clock());
    lift.sync({ seatId: 's1', ...band });
    lift.sync({ seatId: 's1', ...band });
    await settle();
    lift.sync({ seatId: 's1', ...band, mapHeight: 640 });
    expect(lift.isSettling).toBe(true);
    expect(target.calls).toHaveLength(1);
  });

  it('sends nothing before the card has been laid out', async () => {
    const target = sink();
    const lift = new SeatLayerPickerSeatLift(target, new Clock());
    lift.sync({ seatId: 's1', ...band, sheet: 0 });
    lift.sync({ seatId: 's1', ...band, sheet: 0 });
    await settle();
    expect(target.calls).toHaveLength(0);
  });
});

describe('§3.8.2 the re-asks', () => {
  it('asks again at 350 ms and 800 ms and no more', async () => {
    expect([...seatLayerPickerSheetSettleDelaysMs]).toEqual([350, 800]);
    const clock = new Clock();
    const target = sink([{ dy: -120, gestures: 2 }, { dy: 0, gestures: 2 }, { dy: 0, gestures: 2 }]);
    const lift = new SeatLayerPickerSeatLift(target, clock);
    lift.sync({ seatId: 's1', ...band });
    lift.sync({ seatId: 's1', ...band });
    await settle();
    expect(target.calls).toHaveLength(1);
    clock.advance(350);
    await settle();
    expect(target.calls).toHaveLength(2);
    clock.advance(450);
    await settle();
    expect(target.calls).toHaveLength(3);
    clock.advance(5_000);
    await settle();
    expect(target.calls).toHaveLength(3);
  });

  it('re-asks after every snapshot the runtime publishes', async () => {
    const target = sink();
    const lift = new SeatLayerPickerSeatLift(target, new Clock());
    lift.sync({ seatId: 's1', ...band });
    lift.sync({ seatId: 's1', ...band });
    await settle();
    lift.sync({ seatId: 's1', ...band, revision: 2 });
    await settle();
    expect(target.calls).toHaveLength(2);
  });
});

describe('§3.8.2 one lift, one restore', () => {
  it('adds a second seat’s lift to the first and restores once, mid-band', async () => {
    const target = sink([{ dy: -100, gestures: 1 }, { dy: -60, gestures: 1 }]);
    const lift = new SeatLayerPickerSeatLift(target, new Clock());
    lift.sync({ seatId: 's1', ...band });
    lift.sync({ seatId: 's1', ...band });
    await settle();
    lift.sync({ seatId: 's2', ...band });
    await settle();
    expect(lift.dy).toBe(-160);
    lift.release();
    await settle();
    expect(target.calls[target.calls.length - 1]).toEqual({
      seatId: 's2', fraction: seatLayerPickerSheetRestoreFraction, gestures: 1,
    });
    expect(lift.liftedSeatId).toBeNull();
  });

  it('leaves a buyer who moved the map where they put it', async () => {
    const target = sink([{ dy: -100, gestures: 1 }, { dy: 0, gestures: 4 }]);
    const lift = new SeatLayerPickerSeatLift(target, new Clock());
    lift.sync({ seatId: 's1', ...band });
    lift.sync({ seatId: 's1', ...band });
    await settle();
    lift.sync({ seatId: 's1', ...band, revision: 2 });
    await settle();
    // The refused lift left the count where it was, so the restore is refused too.
    expect(lift.dy).toBe(-100);
    lift.release();
    await settle();
    expect(target.calls[target.calls.length - 1]?.gestures).toBe(1);
  });

  it('never restores a lift that never happened', async () => {
    const target = sink([{ dy: 0, gestures: 0 }]);
    const lift = new SeatLayerPickerSeatLift(target, new Clock());
    lift.sync({ seatId: 's1', ...band });
    lift.sync({ seatId: 's1', ...band });
    await settle();
    const sent = target.calls.length;
    lift.release();
    await settle();
    expect(target.calls).toHaveLength(sent);
  });

  it('forgets without touching the map when the picker goes away', async () => {
    const clock = new Clock();
    const target = sink();
    const lift = new SeatLayerPickerSeatLift(target, clock);
    lift.sync({ seatId: 's1', ...band });
    lift.sync({ seatId: 's1', ...band });
    await settle();
    const sent = target.calls.length;
    lift.forget();
    clock.advance(5_000);
    await settle();
    expect(target.calls).toHaveLength(sent);
    expect(clock.scheduled).toBe(0);
  });

  it('puts the map back when the card names no seat', async () => {
    const target = sink();
    const lift = new SeatLayerPickerSeatLift(target, new Clock());
    lift.sync({ seatId: 's1', ...band });
    lift.sync({ seatId: 's1', ...band });
    await settle();
    lift.sync({ seatId: null, ...band });
    await settle();
    expect(target.calls[target.calls.length - 1]?.fraction).toBe(seatLayerPickerSheetRestoreFraction);
  });
});

describe('§3.8.2 the older-runtime fallback', () => {
  it('reports the sheet band as the bottom inset, never alongside a pan', () => {
    expect(seatLayerPickerSeatCardInsetBand({ chromeBottom: 44, cardTop: 500, mapHeight: 700 }))
      .toBe(200 + seatLayerPickerTokens.size.confirmCardSeatGap);
    expect(seatLayerPickerSeatCardInsetBand({ chromeBottom: 300, cardTop: 690, mapHeight: 700 })).toBe(300);
    expect(seatLayerPickerSeatCardInsetBand({ chromeBottom: 0, cardTop: -900, mapHeight: 700 })).toBe(700);
  });
});
