import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  createSeatLayerPickerPartContext,
  renderSeatLayerPickerPart,
  resolveSeatLayerPickerPartBuilder,
} from '../src/picker/builders';
import type { SeatLayerPickerPartContext } from '../src/picker/builders';
import {
  resolveSeatLayerPickerChromeOptions,
  resolveSeatLayerPickerLayoutMode,
  resolveSeatLayerPickerOptions,
  seatLayerPickerBridgeConfigFromOptions,
} from '../src/picker/options';
import type { SeatLayerPickerScopeValue } from '../src/picker/SeatLayerPickerScope';

function scopeWithReporter(reportError = vi.fn()): SeatLayerPickerScopeValue {
  return Object.freeze({
    reportError,
    controller: Object.freeze({}),
    snapshot: Object.freeze({}),
  }) as unknown as SeatLayerPickerScopeValue;
}

describe('ready-made picker options and part builders', () => {
  it('uses phone-safe defaults and resolves nullable chrome controls for each layout', () => {
    const phone = resolveSeatLayerPickerOptions({}, 320);
    const wide = resolveSeatLayerPickerOptions({}, 840);
    expect(phone.layout).toBe('adaptive');
    expect(phone.resolvedLayout).toBe('phone');
    expect(phone.chrome).toEqual({
      header: true, priceLegend: true, floorSelector: true, floorStrip: true, mapControls: true,
      overview: false, zoom: false, colorblind: false, fit: true, map3D: true,
      accessibility: true, cartSheet: true, dock: true, confirmCard: true,
      venue3D: true, seatViewChrome: true, holdPill: true, systemBars: true,
    });
    expect(wide.resolvedLayout).toBe('wide');
    expect(wide.chrome).toMatchObject({ header: true, overview: true, zoom: true, colorblind: true });
    expect(resolveSeatLayerPickerChromeOptions({ overview: null, zoom: true }, 'phone'))
      .toMatchObject({ overview: false, zoom: true });
  });

  it('uses only supported explicit modes and the generated responsive thresholds', () => {
    expect(resolveSeatLayerPickerLayoutMode('phone', 900)).toBe('phone');
    expect(resolveSeatLayerPickerLayoutMode('wide', 1)).toBe('wide');
    expect(resolveSeatLayerPickerLayoutMode('adaptive', 639)).toBe('phone');
    expect(resolveSeatLayerPickerLayoutMode('adaptive', 840)).toBe('wide');
    expect(resolveSeatLayerPickerLayoutMode('future-layout', 840)).toBe('wide');
    expect(resolveSeatLayerPickerLayoutMode('adaptive', Number.POSITIVE_INFINITY)).toBe('phone');
  });

  it('projects only runtime-owned boot fields and never mutates caller option data', () => {
    const input = {
      chrome: { header: false, systemBars: false },
      confirmSelection: false,
      enable3D: false,
      holdTtlMs: 2_000,
      haptics: false,
      initialHoldId: 'hold_1',
      max3DSeats: 12,
      panelInitiallyCollapsed: false,
      refreshOnResume: false,
    };
    const bridge = seatLayerPickerBridgeConfigFromOptions(input);
    expect(bridge).toEqual({
      holdTtlMs: 2_000, initialHoldId: 'hold_1', readOnly: false,
      confirmSelection: false, enableBestAvailable: true, enable3D: false,
      enableSeatView: true, max3DSeats: 12, hideEventDetails: false, panelCollapsed: false,
    });
    for (const hostOnly of ['chrome', 'haptics', 'refreshOnResume', 'announceHoldLapse', 'systemBars']) {
      expect(bridge).not.toHaveProperty(hostOnly);
    }
    expect(input.chrome.header).toBe(false);
  });

  it('accepts positive safe runtime limits without rewriting a host hold identity', () => {
    const resolved = resolveSeatLayerPickerOptions({
      holdTtlMs: Number.MAX_SAFE_INTEGER,
      initialHoldId: '  hold identity owned by the host  ',
      max3DSeats: Number.MAX_SAFE_INTEGER,
    });
    expect(resolved.holdTtlMs).toBe(Number.MAX_SAFE_INTEGER);
    expect(resolved.max3DSeats).toBe(Number.MAX_SAFE_INTEGER);
    expect(resolved.initialHoldId).toBe('  hold identity owned by the host  ');
    expect(resolveSeatLayerPickerOptions({ holdTtlMs: Number.MAX_SAFE_INTEGER + 1 }).holdTtlMs).toBeUndefined();
    expect(resolveSeatLayerPickerOptions({ max3DSeats: -1 }).max3DSeats).toBeUndefined();
  });

  it('keeps floor selector and compact floor strip as independent chrome ownership points', () => {
    const chrome = resolveSeatLayerPickerChromeOptions({ floorSelector: false, floorStrip: true });
    expect(chrome).toMatchObject({ floorSelector: false, floorStrip: true });
    expect(chrome).not.toHaveProperty('floors');
  });

  it('ignores hostile, inherited, array and invalid option values and freezes resolved layers', () => {
    const inherited = Object.create({ readOnly: true });
    const hostile = Object.create(inherited, {
      chrome: { enumerable: true, get: () => { throw new Error('getter'); } },
      holdTtlMs: { enumerable: true, value: Number.POSITIVE_INFINITY },
      initialHoldId: { enumerable: true, value: '   ' },
      max3DSeats: { enumerable: true, value: 0 },
    });
    const proxy = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('trap'); } });
    const resolved = resolveSeatLayerPickerOptions(hostile);
    expect(resolved).toMatchObject({ readOnly: false, holdTtlMs: undefined, initialHoldId: undefined, max3DSeats: undefined });
    expect(resolveSeatLayerPickerOptions(proxy)).toMatchObject({ readOnly: false });
    expect(resolveSeatLayerPickerOptions({ chrome: [true] } as unknown).chrome).toMatchObject({ header: true });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.chrome)).toBe(true);
  });

  it('gives builders the exact frozen scope and default child without creating a replacement scope', () => {
    const reportError = vi.fn();
    const scope = scopeWithReporter(reportError);
    const defaultChild = React.createElement('default-child');
    const builder = vi.fn((context: SeatLayerPickerPartContext) => React.createElement('replacement', { context }));
    const child = renderSeatLayerPickerPart({ header: builder }, scope, 'header', defaultChild) as React.ReactElement;
    const context = builder.mock.calls[0]![0]!;
    expect(context.scope).toBe(scope);
    expect(context.snapshot).toBe(scope.snapshot);
    expect(context.controller).toBe(scope.controller);
    expect(context.defaultChild).toBe(defaultChild);
    expect(context.part).toBe('header');
    expect(Object.isFrozen(context)).toBe(true);
    expect(child.type).toBe('replacement');
    expect(reportError).not.toHaveBeenCalled();
    expect(createSeatLayerPickerPartContext(scope, 'header', defaultChild).scope).toBe(scope);
  });

  it('uses primary builders before aliases and excludes mandatory ownership surfaces', () => {
    const primary = vi.fn();
    const alias = vi.fn();
    expect(resolveSeatLayerPickerPartBuilder({ legend: primary, priceRail: alias }, 'legend')).toBe(primary);
    expect(resolveSeatLayerPickerPartBuilder({ priceRail: alias }, 'legend')).toBe(alias);
    expect(resolveSeatLayerPickerPartBuilder({ selectionTray: alias }, 'cartList')).toBe(alias);
    expect(resolveSeatLayerPickerPartBuilder({ seatConfirmation: primary }, 'seatConfirmation')).toBe(primary);
    expect(resolveSeatLayerPickerPartBuilder({ seatConfirmation: alias }, 'confirmCard')).toBe(alias);
    expect(resolveSeatLayerPickerPartBuilder({ confirmCard: primary, seatConfirmation: alias }, 'confirmCard')).toBe(primary);
    expect(resolveSeatLayerPickerPartBuilder({ confirmCard: alias }, 'seatConfirmation')).toBeUndefined();
    expect(resolveSeatLayerPickerPartBuilder({ floorSelector: primary }, 'floorSelector')).toBe(primary);
    expect(resolveSeatLayerPickerPartBuilder({ sectionNavigator: primary }, 'sectionNavigator')).toBe(primary);
    const inherited = Object.create({ header: primary });
    Object.defineProperty(inherited, 'legend', { enumerable: true, get: () => { throw new Error('getter'); } });
    expect(resolveSeatLayerPickerPartBuilder(inherited, 'header')).toBeUndefined();
    expect(resolveSeatLayerPickerPartBuilder({ header: 'not-a-builder' } as unknown, 'header')).toBeUndefined();
    expect(resolveSeatLayerPickerPartBuilder(new Proxy({}, {
      getOwnPropertyDescriptor: () => { throw new Error('trap'); },
    }), 'header')).toBeUndefined();
    expect(resolveSeatLayerPickerPartBuilder({ attribution: primary, testModeMarker: primary, provider: primary, layout: primary } as unknown, 'header'))
      .toBeUndefined();
  });

  it('contains synchronous errors and thenables exactly once while retaining the default part', () => {
    const defaultChild = React.createElement('default-child');
    const syncReporter = vi.fn();
    const syncScope = scopeWithReporter(syncReporter);
    expect(renderSeatLayerPickerPart({ header: () => { throw new Error('broken'); } }, syncScope, 'header', defaultChild))
      .toBe(defaultChild);
    expect(syncReporter).toHaveBeenCalledTimes(1);
    const asyncReporter = vi.fn();
    const asyncScope = scopeWithReporter(asyncReporter);
    expect(renderSeatLayerPickerPart({ header: () => Promise.resolve(defaultChild) }, asyncScope, 'header', defaultChild))
      .toBe(defaultChild);
    expect(asyncReporter).toHaveBeenCalledTimes(1);
  });
});
