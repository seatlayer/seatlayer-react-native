import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: { flatten: (value: unknown) => value },
}));

import {
  resolveSeatLayerPickerLayout,
  seatLayerPickerDefaultLayout,
} from '../src/picker/layout';
import { resolveSeatLayerPickerStyles } from '../src/picker/styles';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

describe('picker customization foundation', () => {
  it('maps generated size defaults and preserves them through partial layout overrides', () => {
    expect(seatLayerPickerDefaultLayout).toEqual(seatLayerPickerTokens.size);
    expect(seatLayerPickerDefaultLayout).toMatchObject({
      headerHeight: 38,
      dockBarHeight: 52,
      peekHeight: 58,
      sheetMaxHeightFraction: 0.72,
      cartCardMinHeight: 52,
      confirmActionHeight: 44,
      confirmCardMaxWidth: 310,
      minimumHitTarget: 44,
    });
    const layout = resolveSeatLayerPickerLayout({ headerHeight: 64, peekHeight: 56 });
    expect(layout.headerHeight).toBe(64);
    expect(layout.peekHeight).toBe(56);
    expect(layout.dockBarHeight).toBe(52);
    expect(resolveSeatLayerPickerLayout({ headerHeight: undefined }).headerHeight).toBe(38);
    expect(resolveSeatLayerPickerLayout({ headerHeight: 0 }).headerHeight).toBe(0);
    expect(Object.isFrozen(layout)).toBe(true);
  });

  it('ignores invalid JavaScript layout overrides while keeping accessibility invariants', () => {
    const layout = resolveSeatLayerPickerLayout({
      headerHeight: Number.NaN,
      peekHeight: -1,
      sheetMaxHeightFraction: 2,
      cartCardMinHeight: -1,
      minimumHitTarget: 40,
      unexpected: 99,
    } as unknown as Record<string, number>);
    expect(layout.headerHeight).toBe(38);
    expect(layout.peekHeight).toBe(58);
    expect(layout.sheetMaxHeightFraction).toBe(0.72);
    expect(layout.cartCardMinHeight).toBe(52);
    expect(layout.minimumHitTarget).toBe(44);
    expect('unexpected' in layout).toBe(false);
    expect(resolveSeatLayerPickerLayout({ minimumHitTarget: 48 }).minimumHitTarget).toBe(48);
  });

  it('merges typed theme and local styles in deterministic local-last order', () => {
    const themeHeader = { backgroundColor: '#111111', borderColor: '#222222' };
    const localHeader = { backgroundColor: '#FFFFFF' };
    const styles = resolveSeatLayerPickerStyles(
      { headerContainer: themeHeader, headerTitle: { color: '#FFFFFF' }, legendContainer: { borderColor: '#111111' } },
      { headerContainer: localHeader, headerTitle: { color: '#000000' }, legendContainer: { borderWidth: 2 } },
    );
    expect(styles.headerContainer).toEqual([themeHeader, localHeader]);
    expect(styles.headerTitle).toEqual([{ color: '#FFFFFF' }, { color: '#000000' }]);
    expect(styles.legendContainer).toEqual([{ borderColor: '#111111' }, { borderWidth: 2 }]);
  });

  it('keeps the hit target in layout and the button radius in generated theme data', () => {
    expect(seatLayerPickerDefaultLayout.minimumHitTarget).toBe(44);
    expect('button' in seatLayerPickerDefaultLayout).toBe(false);
    expect(seatLayerPickerTokens.radius.button).toBe(9);
  });
});
