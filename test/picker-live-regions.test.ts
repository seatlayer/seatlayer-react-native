import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * §4.10 — which surfaces speak without being asked.
 *
 * A live region is a promise that the words change on their own and that
 * nothing else will say so. The spec names three that are always up — the peek
 * summary, the section dock's name and seats-left, and the hold countdown —
 * and the toast, which is announced outright as well because four seconds
 * inside a cross-fade is a window a live region cannot be relied on to catch.
 * Beside those stand the surfaces that ARRIVE unasked: the buyer-facing states
 * and the hold notices.
 *
 * Everything else is silent until it is reached. This test is the inventory:
 * adding a live region is a decision, and a decision belongs in a diff.
 */

const directory = new URL('../src/picker/', import.meta.url);

const declared: Readonly<Record<string, number>> = Object.freeze({
  // The three the spec names.
  'cartPeekHead.tsx': 1,
  'SeatLayerDockBar.tsx': 1,
  'SeatLayerPickerHoldCountdown.tsx': 1,
  'header.tsx': 1,
  // Announced outright as well (see SeatLayerPickerToast).
  'SeatLayerPickerToast.tsx': 1,
  // Surfaces that arrive without being asked for.
  'SeatLayerPickerStateOverlays.tsx': 2,
  'SeatLayerPickerAccessPanel.tsx': 1,
  'SeatLayerHoldOwnershipNotice.tsx': 1,
  'SeatLayerHoldLapseNotice.tsx': 1,
  'actionError.tsx': 1,
  'status.tsx': 1,
  // The answer to a press inside a prompt the buyer has open.
  'SeatLayerPickerDecisionPrompts.tsx': 1,
  // The count the stepper changes under the buyer's own finger.
  'SeatLayerBestSeatsForm.tsx': 1,
});

function count(name: string): number {
  const source = readFileSync(new URL(name, directory), 'utf8');
  return [...source.matchAll(/accessibilityLiveRegion=/g)].length;
}

describe('§4.10 live regions are an inventory, not a habit', () => {
  it('has exactly the declared set and nothing else', () => {
    const found: Record<string, number> = {};
    for (const name of readdirSync(directory).filter((entry) => /\.tsx?$/.test(entry))) {
      const total = count(name);
      if (total > 0) found[name] = total;
    }
    expect(found).toEqual(Object.fromEntries(
      Object.entries(declared).filter(([, total]) => total > 0),
    ));
  });

  it('keeps the seat card silent until it is reached — it names itself already', () => {
    expect(count('SeatLayerConfirmCard.tsx')).toBe(0);
    expect(count('confirmCardParts.tsx')).toBe(0);
    expect(count('SeatLayerPickerSeatConfirmation.tsx')).toBe(0);
  });

  it('announces a toast outright as well as marking it live', () => {
    const source = readFileSync(new URL('SeatLayerPickerToast.tsx', directory), 'utf8');
    expect(source).toContain('accessibilityLiveRegion');
    expect(source).toContain('announceForAccessibility');
  });

  it('leaves the hold countdown one announcer, throttled by its own module', () => {
    const pill = readFileSync(new URL('SeatLayerPickerHoldCountdown.tsx', directory), 'utf8');
    const head = readFileSync(new URL('header.tsx', directory), 'utf8');
    // Both draw a pill, but the composition hands one to the other: the header
    // renders `props.holdCountdown` when it is given, and its own pill only
    // when it is not.
    expect(pill).toContain('seatLayerHoldAnnouncementFor');
    expect(head).toContain('seatLayerHoldAnnouncementFor');
    expect(head).toContain('props.holdCountdown !== undefined');
    // Nothing else in the picker speaks the clock.
    const others = readdirSync(directory)
      .filter((entry) => /\.tsx?$/.test(entry) &&
        !['SeatLayerPickerHoldCountdown.tsx', 'header.tsx', 'holdCountdownAnnounce.ts'].includes(entry))
      .filter((entry) => readFileSync(new URL(entry, directory), 'utf8').includes('seatLayerHoldAnnouncementFor'));
    expect(others).toEqual([]);
  });
});
