import { describe, expect, it } from 'vitest';

import { resolveSeatLayerPickerLayout } from '../src/picker/layout';
import {
  deriveSeatLayerPickerOnAccent,
  resolveSeatLayerPickerTheme,
} from '../src/picker/theme';
import { resolveSeatLayerPickerScopeTheme } from '../src/picker/scopeTheme';

describe('picker theme runtime boundary', () => {
  it('falls back safely when modes or public theme records are hostile', () => {
    const throwingTheme = new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error('do not read me');
      },
    });
    const options = Object.create({ themeMode: 'dark' });
    Object.defineProperty(options, 'themeMode', {
      enumerable: true,
      get() {
        throw new Error('do not invoke accessors');
      },
    });
    Object.defineProperty(options, 'theme', { enumerable: true, value: throwingTheme });

    expect(() => resolveSeatLayerPickerTheme(options)).not.toThrow();
    expect(resolveSeatLayerPickerTheme(options).themeMode).toBe('light');
    expect(resolveSeatLayerPickerTheme({ themeMode: 'unknown' as never }).themeMode).toBe('light');
    expect(resolveSeatLayerPickerTheme({
      themeMode: 'unknown' as never,
      theme: { themeMode: 'dark' },
      brand: 'night',
      brands: { night: { themeMode: 'light' } },
    }).themeMode).toBe('dark');
    expect(resolveSeatLayerPickerTheme({
      themeMode: 'auto',
      theme: { themeMode: 'dark' },
      hostThemeMode: 'light',
    }).themeMode).toBe('light');
  });

  it('uses only own data color fields and cannot pollute resolved theme records', () => {
    const colors = Object.create({ accent: '#FFFF00' }) as Record<string, unknown>;
    Object.defineProperty(colors, 'accent', {
      enumerable: true,
      get() {
        throw new Error('do not invoke accessors');
      },
    });
    Object.defineProperty(colors, '__proto__', {
      enumerable: true,
      value: { polluted: true },
    });
    const theme = resolveSeatLayerPickerTheme({ theme: { colors: colors as never } });

    expect(theme.colors.accent).toBe('#5B4B8A');
    expect(Object.getPrototypeOf(theme.colors)).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.roles)).toBe(true);
    expect(Object.isFrozen(theme.roles.primaryAction)).toBe(true);
    expect(Object.isFrozen(theme.elevation)).toBe(true);
    expect(Object.isFrozen(theme.typography.headerTitle)).toBe(true);
    expect(Object.isFrozen(theme.motion.curve.easeEnter.cubicBezier)).toBe(true);
  });

  it('rejects poisoned logo data and retains a safe fallback source', () => {
    const cycle: { uri?: string; self?: unknown } = { uri: 'https://cdn.example.test/cycle.png' };
    cycle.self = cycle;
    const sparse: Array<{ uri: string }> = [];
    sparse[1] = { uri: 'https://cdn.example.test/sparse.png' };
    const symbolSource = { uri: 'https://cdn.example.test/symbol.png', [Symbol('source')]: true };
    class ImageSource {
      uri = 'https://cdn.example.test/class.png';
    }
    const throwingProxy = new Proxy({}, {
      ownKeys() {
        throw new Error('do not enumerate me');
      },
    });
    const fallback = { uri: 'https://cdn.example.test/safe.png', headers: { accept: 'image/*' } };

    for (const logoSource of [0, cycle, sparse, symbolSource, new ImageSource(), throwingProxy]) {
      const theme = resolveSeatLayerPickerTheme({
        logoSource: logoSource as never,
        organizerBranding: { logoUrl: fallback.uri },
      });
      expect(theme.logoSource).toEqual({ uri: fallback.uri });
    }

    const cloned = resolveSeatLayerPickerTheme({ logoSource: fallback }).logoSource as {
      headers: Record<string, string>;
    };
    expect(cloned).toEqual(fallback);
    expect(cloned).not.toBe(fallback);
    expect(Object.isFrozen(cloned)).toBe(true);
    expect(Object.isFrozen(cloned.headers)).toBe(true);
  });

  it('accepts composable RN colors and ignores transparent or unsupported brand candidates', () => {
    expect(deriveSeatLayerPickerOnAccent('#fff', '#123456')).toBe('#000000');
    expect(deriveSeatLayerPickerOnAccent('#000f', '#123456')).toBe('#FFFFFF');
    expect(deriveSeatLayerPickerOnAccent('#ffffff80', '#123456')).toBe('#000000');
    expect(deriveSeatLayerPickerOnAccent('rgb(0, 0, 0)', '#123456')).toBe('#FFFFFF');
    expect(deriveSeatLayerPickerOnAccent('rgb(255, 255, 0)', '#123456')).toBe('#000000');
    expect(resolveSeatLayerPickerTheme({
      theme: { colors: { accent: 'named-colour' } },
      organizerBranding: { accent: '#102030' },
    }).colors.accent).toBe('#102030');
    expect(resolveSeatLayerPickerTheme({
      theme: { colors: { accent: 'transparent' } },
      organizerBranding: { accent: '#102030' },
    }).colors.accent).toBe('#102030');
    expect(resolveSeatLayerPickerTheme({
      theme: { colors: { text: 'invalid' } },
      organizerBranding: { text: '#203040' },
    }).colors.text).toBe('#203040');
    expect(resolveSeatLayerPickerTheme({
      theme: { colors: { text: 'named-colour' } },
      organizerBranding: { text: '#203040' },
    }).colors.text).toBe('#203040');
    expect(resolveSeatLayerPickerTheme({
      theme: { colors: { surface: 'named-colour' } },
      organizerBranding: { surface: '#203040' },
    }).colors.surface).toBe('#203040');
    expect(resolveSeatLayerPickerTheme({
      theme: { colors: { accent: 'rgba(10, 20, 30, 0.5)' } },
    }).colors.accent).toBe('rgba(10, 20, 30, 0.5)');
    expect(resolveSeatLayerPickerTheme({
      mapTheme: { background: 'transparent' },
      theme: { mapTheme: { background: '#102030' } },
    }).mapTheme.background).toBe('#102030');
    expect(resolveSeatLayerPickerTheme({
      mapTheme: { selectionColor: 'invalid' },
      theme: { mapTheme: { selectionColor: '#203040' } },
    }).mapTheme.selectionColor).toBe('#203040');
  });

  it('composes scope options through own data without invoking getters and respects organizer null', () => {
    const hostile = {} as Record<string, unknown>;
    Object.defineProperty(hostile, 'organizerBranding', {
      enumerable: true,
      get() { throw new Error('do not invoke theme getter'); },
    });
    const snapshot = { branding: { accent: '#102030', attributionRequired: false } } as never;
    expect(() => resolveSeatLayerPickerScopeTheme(hostile as never, 'light', 'light', snapshot)).not.toThrow();
    expect(resolveSeatLayerPickerScopeTheme({ organizerBranding: null }, 'light', 'light', snapshot).colors.accent)
      .not.toBe('#102030');
    const descriptorTrap = new Proxy({}, {
      getOwnPropertyDescriptor() { throw new Error('theme proxy descriptor'); },
    });
    expect(() => resolveSeatLayerPickerScopeTheme(descriptorTrap as never, 'light', 'light', snapshot)).not.toThrow();
  });
});

describe('picker layout runtime boundary', () => {
  it('ignores inherited and accessor values while surviving hostile proxies', () => {
    const inherited = Object.create({ headerHeight: 99 }) as Record<string, unknown>;
    Object.defineProperty(inherited, 'peekHeight', {
      enumerable: true,
      get() {
        throw new Error('do not invoke accessors');
      },
    });
    const throwingProxy = new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error('do not read me');
      },
    });

    expect(resolveSeatLayerPickerLayout(inherited).headerHeight).toBe(38);
    expect(() => resolveSeatLayerPickerLayout(throwingProxy)).not.toThrow();
    expect(resolveSeatLayerPickerLayout({ headerHeight: 64, denseVisibleLines: 3 })).toMatchObject({
      headerHeight: 64,
      denseVisibleLines: 3,
    });
  });

  it('keeps a valid lower-priority brand value when a host value is invalid', () => {
    const theme = resolveSeatLayerPickerTheme({
      brand: 'festival',
      brands: { festival: { layout: { headerHeight: 68, sheetMaxHeightFraction: 0.7 } } },
      theme: { layout: { headerHeight: Number.NaN, sheetMaxHeightFraction: 2 } },
    });

    expect(theme.layout).toMatchObject({ headerHeight: 68, sheetMaxHeightFraction: 0.7 });
  });
});
