import { describe, expect, it } from 'vitest';

import { seatLayerDockAccessGlyph, seatLayerDockCountCopy } from '../src/picker/dockCount';
import { resolveSeatLayerPickerChromeOptions } from '../src/picker/options';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const strings = seatLayerPickerTokens.strings;

function translate(
  key: string,
  options?: { count?: number; values?: Record<string, string | number> },
): string {
  const template = (strings as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = options?.values?.[name] ?? options?.count;
    return value === undefined ? placeholder : String(value);
  });
}

function copy(input: {
  seatsLeft?: number;
  accessibleFree?: Record<string, number>;
  filter?: readonly string[];
  counts?: boolean;
}) {
  const section: any = { id: 's1', label: '205', accessibleFree: input.accessibleFree };
  return seatLayerDockCountCopy({
    sectionName: '205',
    seatsLeft: input.seatsLeft,
    section,
    snapshot: {
      capabilities: input.counts === false ? [] : ['section-access-counts-v1'],
      map: { accessibilityFilter: [...(input.filter ?? [])] },
    } as any,
    translate,
  });
}

describe('§3.6 dock count fit ladder', () => {
  it('says the full sentence first and the short one next', () => {
    const one = copy({ seatsLeft: 1 });
    expect(one.long).toBe('1 seat left');
    expect(one.short).toBe('1 left');
    const many = copy({ seatsLeft: 302 });
    expect(many.long).toBe('302 seats left');
    expect(many.short).toBe('302 left');
  });

  it('draws no count at all where seatsLeft is unknown', () => {
    const none = copy({});
    expect(none.long).toBe('');
    expect(none.short).toBe('');
    expect(none.accessibleName).toBe('205');
  });
});

describe('§3.6 matching spaces (· ♿ N)', () => {
  it('rides both rungs and the accessible name, summed over active provisions', () => {
    const result = copy({
      seatsLeft: 302,
      filter: ['wheelchair', 'companion'],
      accessibleFree: { wheelchair: 2, companion: 1, hearing: 9 },
    });
    expect(result.accessSuffix).toBe(` · ${seatLayerDockAccessGlyph} 3`);
    expect(result.long).toBe(`302 seats left · ${seatLayerDockAccessGlyph} 3`);
    expect(result.short).toBe(`302 left · ${seatLayerDockAccessGlyph} 3`);
    expect(result.accessibleName).toBe(`205 · 302 seats left · ${seatLayerDockAccessGlyph} 3`);
  });

  it('says nothing where the section was not counted — absent is not zero', () => {
    expect(copy({
      seatsLeft: 12, filter: ['wheelchair'], accessibleFree: undefined,
    }).accessSuffix).toBeUndefined();
    expect(copy({
      seatsLeft: 12, filter: ['wheelchair'], accessibleFree: { hearing: 4 },
    }).accessSuffix).toBeUndefined();
    // A counted zero IS an answer and is said.
    expect(copy({
      seatsLeft: 12, filter: ['wheelchair'], accessibleFree: { wheelchair: 0 },
    }).accessSuffix).toBe(` · ${seatLayerDockAccessGlyph} 0`);
  });

  it('is withheld with no filter on and without the counting capability', () => {
    expect(copy({ seatsLeft: 12, accessibleFree: { wheelchair: 2 } }).accessSuffix)
      .toBeUndefined();
    expect(copy({
      seatsLeft: 12, filter: ['wheelchair'], accessibleFree: { wheelchair: 2 }, counts: false,
    }).accessSuffix).toBeUndefined();
  });
});

describe('§3.6 the dock bar is opt-in on every width', () => {
  it('mounts no dock on any width unless the host asks for one', () => {
    expect(resolveSeatLayerPickerChromeOptions({}, 'phone').showDockBar).toBe(false);
    expect(resolveSeatLayerPickerChromeOptions({}, 'wide').showDockBar).toBe(false);
    expect(resolveSeatLayerPickerChromeOptions({ showDockBar: true }, 'phone').showDockBar).toBe(true);
    expect(resolveSeatLayerPickerChromeOptions({ showDockBar: true }, 'wide').showDockBar).toBe(true);
  });
});

describe('§3.6/§3.7 the dock and floor rail are drawn to their tokens', () => {
  it('reads every dock and floor size from the generated module', () => {
    const size = seatLayerPickerTokens.size;
    expect(size.dockBarHeight).toBe(52);
    expect(size.dockDotSize).toBe(10);
    expect(size.dockLeadingInset).toBe(14);
    expect(size.dockTrailingInset).toBe(8);
    expect(size.dockNavWidth).toBe(34);
    expect(size.dockNavHeight).toBe(36);
    expect(size.dockBackHeight).toBe(36);
    expect(size.floorChipHeight).toBe(28);
    expect(size.floorRailPadding).toBe(3);
    expect(size.floorRailGap).toBe(1);
    expect(size.floorInfoSize).toBe(26);
  });
});
