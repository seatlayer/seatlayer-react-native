import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import {
  SeatLayerChartLoadAttempt,
  decodeSeatLayerChartLoadEvent,
  decodeSeatLayerChartLoadTrace,
} from '../src/picker/chartLoad';
import { SeatLayerPickerController } from '../src/picker/controller';
import { SeatLayerPickerScope } from '../src/picker/SeatLayerPickerScope';

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
  useColorScheme: () => 'light',
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type UnknownListener = (value: { name: string; payload: unknown }) => void;

class ChartLoadMapHost {
  isReady = true;
  capabilities = true;
  events = true;
  private readonly unknownListeners = new Set<UnknownListener>();

  on(name: string, listener: unknown): () => void {
    if (name === 'unknownEvent') this.unknownListeners.add(listener as UnknownListener);
    return () => this.unknownListeners.delete(listener as UnknownListener);
  }

  supportsPickerCapability(name: string): boolean {
    return this.capabilities && name === 'chart-load-trace-v1';
  }
  supportsPickerEvent(name: string): boolean {
    return this.events && name === 'telemetry.chartLoad';
  }
  supportsPickerCommand(): boolean { return false; }
  emit(name: string, payload: unknown): void {
    for (const listener of this.unknownListeners) listener({ name, payload });
  }
}

const fullTrace = Object.freeze({
  event: 'fixture-event-chart-load', scope: 'event', surface: 'seating_chart', outcome: 'success', stage: '',
  ms: 800, api: 569, scene: 128, panel: 0, paint: 40, normalize: 26, renderer: 11,
  availabilityMs: 563, seats: 3628, floors: 2, view: 'map', load: 'cold', transport: 'pubapi',
  chartBytes: 184320, chartCache: 'hit', server: 41, r2Head: 7, cacheLookup: 3, r2Get: 0,
  transform: 12, host: 'webview', platform: 'rn', bundle: '0.71.3', protocol: 2,
  chromeOwner: 'native', bootMs: 1018, documentMs: 212, handshakeMs: 1, future: { keep: ['me'] },
});

function controllerFor(host: ChartLoadMapHost): SeatLayerPickerController {
  return new SeatLayerPickerController(host as never);
}

describe('picker chart-load visibility', () => {
  it('decodes every known field, preserves future raw JSON, and freezes the trace', () => {
    const trace = decodeSeatLayerChartLoadTrace(fullTrace)!;
    const { future: _future, ...known } = fullTrace;
    expect(trace).toMatchObject(known);
    expect(trace.succeeded).toBe(true);
    expect(trace.raw).toMatchObject({ future: { keep: ['me'] } });
    expect(Object.isFrozen(trace)).toBe(true);
    expect(Object.isFrozen(trace.raw)).toBe(true);
    expect(Object.isFrozen(trace.raw.future)).toBe(true);
    expect(Object.isFrozen((trace.raw.future as { keep: unknown }).keep)).toBe(true);
    const futureType = decodeSeatLayerChartLoadTrace({ ms: 'future-number', futureMetric: 4 })!;
    expect(futureType.ms).toBeUndefined();
    expect(futureType.raw).toMatchObject({ ms: 'future-number', futureMetric: 4 });
  });

  it('drops malformed or hostile trace containers without invoking accessors', () => {
    const accessor = Object.create(null, {
      trace: { enumerable: true, get: () => { throw new Error('accessed'); } },
    });
    const proxy = new Proxy({ hostile: true }, { getOwnPropertyDescriptor: () => { throw new Error('trap'); } });
    expect(decodeSeatLayerChartLoadEvent(accessor)).toBeUndefined();
    expect(decodeSeatLayerChartLoadEvent({ trace: proxy })).toBeUndefined();
    expect(decodeSeatLayerChartLoadEvent({ trace: [] })).toBeUndefined();
    expect(decodeSeatLayerChartLoadTrace({ ms: Number.POSITIVE_INFINITY })).toBeUndefined();
    expect(decodeSeatLayerChartLoadTrace({})).toBeDefined();
  });

  it('keeps negative numeric fields in raw but omits them from typed metrics and bounds hostile shapes', () => {
    const negative = decodeSeatLayerChartLoadTrace({ ms: -1, seats: -2, chartBytes: -3, future: -4 })!;
    expect(negative).toMatchObject({ ms: undefined, seats: undefined, chartBytes: undefined });
    expect(negative.raw).toMatchObject({ ms: -1, seats: -2, chartBytes: -3, future: -4 });
    let deep: unknown = 0;
    for (let index = 0; index < 34; index += 1) deep = { next: deep };
    expect(decodeSeatLayerChartLoadTrace(deep)).toBeUndefined();
    expect(decodeSeatLayerChartLoadTrace({ values: Array.from({ length: 1_025 }, () => 0) })).toBeUndefined();
    expect(decodeSeatLayerChartLoadTrace(Object.fromEntries(
      Array.from({ length: 1_025 }, (_, index) => [`k${index}`, 0]),
    ))).toBeUndefined();
  });

  it('keeps missing outcome successful and computes clamped host timing only after ready', () => {
    let now = 100;
    const attempt = new SeatLayerChartLoadAttempt(() => now);
    attempt.begin();
    const failure = decodeSeatLayerChartLoadTrace({ outcome: 'failed', bootMs: 20 })!;
    expect(attempt.merge(failure)).toMatchObject({ tapToReadyMs: null, ready: null, hostMs: null });
    now = 140;
    attempt.markReady({ protocolRevision: 2, raw: undefined });
    expect(attempt.merge(decodeSeatLayerChartLoadTrace({ bootMs: 80 })!)).toMatchObject({
      tapToReadyMs: 40, hostMs: 0,
    });
    expect(decodeSeatLayerChartLoadTrace({})!.succeeded).toBe(true);
  });

  it('requires both the advertised capability and exact event before broadcasting', () => {
    for (const [capabilities, events, expected] of [[false, false, 0], [true, false, 0], [false, true, 0], [true, true, 1]] as const) {
      const host = new ChartLoadMapHost();
      host.capabilities = capabilities;
      host.events = events;
      const controller = controllerFor(host);
      const listener = vi.fn();
      controller.subscribeChartLoad(listener);
      controller.beginChartLoadAttempt(0);
      host.emit('telemetry.chartLoad', { trace: fullTrace });
      expect(listener).toHaveBeenCalledTimes(expected);
      controller.dispose();
    }
  });

  it('does not replay events to late listeners and contains observer failures', () => {
    const host = new ChartLoadMapHost();
    const controller = controllerFor(host);
    const first = vi.fn();
    const throwing = vi.fn(() => { throw new Error('observer'); });
    controller.beginChartLoadAttempt(0);
    controller.subscribeChartLoad(first);
    controller.subscribeChartLoad(throwing);
    host.emit('telemetry.chartLoad', { trace: fullTrace });
    const late = vi.fn(() => Promise.reject(new Error('rejected')));
    controller.subscribeChartLoad(late);
    expect(first).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
    host.emit('telemetry.chartLoad', { trace: { ...fullTrace, outcome: 'failed' } });
    expect(first).toHaveBeenCalledTimes(2);
    expect(throwing).toHaveBeenCalledTimes(2);
    expect(late).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('keeps a ready attempt across unrelated events, resets only on a retry, and retires listeners on dispose', () => {
    const host = new ChartLoadMapHost();
    const controller = controllerFor(host);
    const listener = vi.fn();
    controller.subscribeChartLoad(listener);
    controller.beginChartLoadAttempt(0);
    controller.markChartLoadReady({ protocolRevision: 2, raw: undefined });
    host.emit('picker.snapshot', { revision: 2 });
    host.emit('telemetry.chartLoad', { trace: fullTrace });
    expect(listener.mock.calls[0]![0]).toMatchObject({ ready: { protocolRevision: 2 } });
    controller.beginChartLoadAttempt(10);
    host.emit('telemetry.chartLoad', { trace: { outcome: 'failed' } });
    expect(listener.mock.calls[1]![0]).toMatchObject({ tapToReadyMs: null, ready: null });
    controller.dispose();
    host.emit('telemetry.chartLoad', { trace: fullTrace });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps scope callbacks current across theme updates and suppresses retired controller and unmounted callbacks', async () => {
    const firstHost = new ChartLoadMapHost();
    const secondHost = new ChartLoadMapHost();
    const first = controllerFor(firstHost);
    const second = controllerFor(secondHost);
    const observed = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    const scopeTree = (controller: SeatLayerPickerController, themeMode: 'light' | 'dark') => React.createElement(
      SeatLayerPickerScope,
      { configuration: { event: 'chart' }, controller, themeMode, onChartLoad: observed },
      React.createElement('chart-load-probe'),
    );
    await act(async () => { tree = TestRenderer.create(scopeTree(first, 'light')); });
    await act(async () => { firstHost.emit('telemetry.chartLoad', { trace: fullTrace }); });
    expect(observed).toHaveBeenCalledTimes(1);
    await act(async () => { tree.update(scopeTree(first, 'dark')); });
    await act(async () => { firstHost.emit('telemetry.chartLoad', { trace: fullTrace }); });
    expect(observed).toHaveBeenCalledTimes(2);
    await act(async () => { tree.update(scopeTree(second, 'dark')); });
    await act(async () => { firstHost.emit('telemetry.chartLoad', { trace: fullTrace }); });
    expect(observed).toHaveBeenCalledTimes(2);
    await act(async () => { secondHost.emit('telemetry.chartLoad', { trace: fullTrace }); });
    expect(observed).toHaveBeenCalledTimes(3);
    await act(async () => { tree.unmount(); });
    secondHost.emit('telemetry.chartLoad', { trace: fullTrace });
    expect(observed).toHaveBeenCalledTimes(3);
    first.dispose();
    second.dispose();
  });
});
