import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SeatLayerConnectionWatch,
  seatLayerConnectionStateFrom,
  seatLayerLineDown,
  type SeatLayerConnectionShown,
} from '../src/picker/connection';

describe('the page line', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the four states and ignores one it does not know', () => {
    expect(seatLayerConnectionStateFrom('live')).toBe('live');
    expect(seatLayerConnectionStateFrom('reconnecting')).toBe('reconnecting');
    expect(seatLayerConnectionStateFrom('polling')).toBe('polling');
    expect(seatLayerConnectionStateFrom('offline')).toBe('offline');
    expect(seatLayerConnectionStateFrom('satellite')).toBeNull();
    expect(seatLayerConnectionStateFrom(null)).toBeNull();
    expect(seatLayerLineDown('offline')).toBe(true);
    expect(seatLayerLineDown('reconnecting')).toBe(true);
    expect(seatLayerLineDown('polling')).toBe(false);
    expect(seatLayerLineDown('live')).toBe(false);
    expect(seatLayerLineDown(null)).toBe(false);
  });

  it('a blink of the network says nothing', () => {
    const watch = new SeatLayerConnectionWatch();
    watch.heard('offline');
    vi.advanceTimersByTime(2000);
    watch.heard('live');
    watch.seatsRead();
    vi.advanceTimersByTime(5000);
    expect(watch.shown).toBe('none');
    watch.dispose();
  });

  it('offline after three seconds, then Updating, then Back online once the seats are read, for two and a half seconds', () => {
    const watch = new SeatLayerConnectionWatch();
    const seen: SeatLayerConnectionShown[] = [];
    watch.subscribe((shown) => seen.push(shown));

    watch.heard('offline');
    vi.advanceTimersByTime(2999);
    expect(watch.shown).toBe('none');
    vi.advanceTimersByTime(1);
    expect(watch.shown).toBe('offline');

    watch.heard('reconnecting');
    expect(watch.shown).toBe('updating');
    watch.heard('live');
    // Not back until the seats have been read again.
    expect(watch.shown).toBe('updating');
    watch.seatsRead();
    expect(watch.shown).toBe('back');
    vi.advanceTimersByTime(2500);
    expect(watch.shown).toBe('none');

    expect(seen).toEqual(['offline', 'updating', 'back', 'none']);
    watch.dispose();
  });

  it('a line that only retries says Updating after ten seconds and goes without Back online', () => {
    const watch = new SeatLayerConnectionWatch();
    watch.heard('reconnecting');
    vi.advanceTimersByTime(9000);
    expect(watch.shown).toBe('none');
    vi.advanceTimersByTime(1000);
    expect(watch.shown).toBe('updating');
    watch.heard('live');
    watch.seatsRead();
    expect(watch.shown).toBe('none');
    watch.dispose();
  });

  it('seats by poll after an outage count as back', () => {
    const watch = new SeatLayerConnectionWatch();
    watch.heard('offline');
    vi.advanceTimersByTime(3000);
    watch.heard('polling');
    watch.seatsRead();
    expect(watch.shown).toBe('back');
    watch.dispose();
  });

  it('losing the line again during an outage says offline at once', () => {
    const watch = new SeatLayerConnectionWatch();
    watch.heard('offline');
    vi.advanceTimersByTime(3000);
    watch.heard('reconnecting');
    watch.heard('offline');
    expect(watch.shown).toBe('offline');
    watch.dispose();
  });

  it('a new page forgets the old one, and a repeat changes nothing', () => {
    const watch = new SeatLayerConnectionWatch();
    const seen: SeatLayerConnectionShown[] = [];
    watch.subscribe((shown) => seen.push(shown));
    watch.heard('offline');
    vi.advanceTimersByTime(3000);
    watch.heard('offline');
    expect(seen).toEqual(['offline']);
    watch.reset();
    expect(watch.shown).toBe('none');
    expect(watch.state).toBeNull();
    watch.heard('live');
    watch.seatsRead();
    expect(watch.shown).toBe('none');
    watch.dispose();
  });
});
