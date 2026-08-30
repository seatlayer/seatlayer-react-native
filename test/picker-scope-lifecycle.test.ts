import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';

const native = vi.hoisted(() => {
  let hardwareBack: (() => boolean) | undefined;
  const addEventListener = vi.fn((_name: string, listener: () => boolean) => {
    hardwareBack = listener;
    return { remove: () => { hardwareBack = undefined; } };
  });
  return {
    addEventListener,
    fire: () => hardwareBack?.() ?? false,
    reset: () => { hardwareBack = undefined; addEventListener.mockClear(); },
  };
});

const insets = vi.hoisted(() => {
  const calls: string[] = [];
  return { calls, reset: () => { calls.length = 0; } };
});

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
  BackHandler: { addEventListener: native.addEventListener },
  Modal: 'Modal',
  useColorScheme: () => 'light',
}));

vi.mock('../src/picker/scopeInsets', () => ({
  SeatLayerPickerScopeInsets: class {
    setBand(band: string, value: { top?: number }): void { insets.calls.push(`set:${band}:${value.top ?? 0}`); }
    removeBand(band: string): void { insets.calls.push(`remove:${band}`); }
    markReady(): void {}
    dispose(): void {}
  },
}));

import { SeatLayerPickerController } from '../src/picker/controller';
import {
  SeatLayerPickerScope,
  SeatLayerPickerScopeReprovider,
  useSeatLayerPickerScope,
  type SeatLayerPickerScopeValue,
} from '../src/picker/SeatLayerPickerScope';
import { SeatLayerPickerPromptModal } from '../src/picker/promptModal';
import { SeatLayerPickerScopeBackHandler } from '../src/picker/scopeBackHandler';
import { seatLayerPickerSnapshotSchema, type SeatLayerPickerSnapshot } from '../src/picker/models';
import { projectSeatLayerCartSheet } from '../src/picker/cartSheetUi';
import type { JsonObject } from '../src/json';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Capture { current: SeatLayerPickerScopeValue | undefined; }

function Probe({ capture }: { readonly capture: Capture }): React.ReactElement {
  capture.current = useSeatLayerPickerScope();
  return React.createElement('scope-probe');
}

function ReprovidedProbe({ capture }: { readonly capture: Capture }): React.ReactElement {
  const outer = useSeatLayerPickerScope();
  return React.createElement(
    SeatLayerPickerScopeReprovider,
    undefined,
    React.createElement(ReprovidedInner, { outer, capture }),
  );
}

function ReprovidedInner({ outer, capture }: { readonly outer: SeatLayerPickerScopeValue; readonly capture: Capture }): React.ReactElement {
  const inner = useSeatLayerPickerScope();
  capture.current = inner;
  return React.createElement('reprovided-probe', { same: outer === inner });
}

function ModalHost({ capture }: { readonly capture: Capture }): React.ReactElement {
  const outer = useSeatLayerPickerScope();
  return React.createElement(
    SeatLayerPickerPromptModal,
    { visible: true, children: React.createElement(ModalIdentityProbe, { outer, capture }) },
  );
}

function ModalIdentityProbe({ outer, capture }: { readonly outer: SeatLayerPickerScopeValue; readonly capture: Capture }): React.ReactElement {
  const inner = useSeatLayerPickerScope();
  capture.current = inner;
  return React.createElement('modal-identity-probe', { same: outer === inner });
}

function treeFor(
  controller: SeatLayerPickerController,
  capture: Capture,
  options: { readonly event?: string; readonly bridgeConfig?: JsonObject; readonly readOnly?: boolean; readonly refreshOnResume?: boolean; readonly modal?: boolean; readonly hardware?: boolean; readonly reprovider?: boolean } = {},
): React.ReactElement {
  return React.createElement(
    SeatLayerPickerScope,
    { configuration: { event: options.event ?? 'phase-one' }, controller, bridgeConfig: options.bridgeConfig, readOnly: options.readOnly ?? false, refreshOnResume: options.refreshOnResume },
    options.reprovider ? React.createElement(ReprovidedProbe, { capture }) : React.createElement(Probe, { capture }),
    options.hardware ? React.createElement(SeatLayerPickerScopeBackHandler) : null,
    options.modal ? React.createElement(ModalHost, { capture }) : null,
  );
}

function snapshot(revision: number, map: Partial<SeatLayerPickerSnapshot['map']> = {}, selection: readonly object[] = []): SeatLayerPickerSnapshot {
  return {
    schema: seatLayerPickerSnapshotSchema, sessionId: 'phase', revision,
    event: { key: 'event', name: 'Event', mode: 'picker', currency: 'USD', salesClosed: false },
    branding: { attributionRequired: false }, categories: [], zones: [], sections: [], generalAdmissionAreas: [], bestAvailableZones: [],
    map: { rung: 'overview', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'free', colorblindSafe: false, hideLimitedView: false, canZoomIn: false, canZoomOut: false, categoryFilter: [], accessibilityFilter: [], floors: [], ...map },
    selection: selection as never, maxSelection: 8, ticketCount: 0, cartLines: [], cartTotal: 0, currency: 'USD',
    hold: { active: false }, accessConfigured: false, accessStatus: 'available', capabilities: [], raw: {},
  };
}

function apply(controller: SeatLayerPickerController, value: SeatLayerPickerSnapshot): void {
  (controller as unknown as { applyPickerSnapshot(next: SeatLayerPickerSnapshot): boolean }).applyPickerSnapshot(value);
}

class LifecycleTransport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void { this.frames.push(frame); }
  commands(): Envelope[] { return this.frames.filter((frame) => frame.kind === 'cmd'); }
}

async function readyLifecycleController(options: { readonly holdSelection?: boolean } = {}): Promise<{
  readonly controller: SeatLayerPickerController;
  readonly transport: LifecycleTransport;
}> {
  const config = { enable3D: false, enableSeatView: false };
  const profile = pickerBridgeProfile({ config });
  const controller = new SeatLayerPickerController();
  const transport = new LifecycleTransport();
  const ready = controller.beginHandshake(transport, { event: 'phase-one' }, { config });
  controller.mapController.ingestRaw({
    sl: 1, k: 'hello', t: 'hello', p: {
      protocol: { min: 2, max: 2 },
      capabilities: [
        ...profile.requiredCapabilities,
        'availability-refresh-v1',
        ...(options.holdSelection === false ? [] : ['hold-selection-v1']),
      ],
      commands: [
        ...profile.requiredCommands,
        'picker.refreshAvailability',
        ...(options.holdSelection === false ? [] : ['picker.holdSelection']),
      ],
      events: ['picker.snapshot'],
    },
  });
  controller.mapController.ingestRaw({
    sl: 1, k: 'evt', t: 'sys.ready', n: 1,
    p: { protocol: 2, snapshot: snapshot(1) },
  });
  await ready;
  return { controller, transport };
}

function replyLifecycle(
  controller: SeatLayerPickerController,
  command: Envelope,
  payload: object,
): void {
  controller.mapController.ingestRaw({
    sl: 1, k: 'res', t: command.type, id: command.id, p: payload,
  });
}

function rejectLifecycle(
  controller: SeatLayerPickerController,
  command: Envelope,
): void {
  controller.mapController.ingestRaw({
    sl: 1, k: 'err', t: command.type, id: command.id,
    p: { message: 'unavailable' },
  });
}

describe('picker scope production lifecycle', () => {
  it('does not create an invisible pending/back rung when confirmation is disabled or the scope is read-only', async () => {
    for (const options of [
      { bridgeConfig: { confirmSelection: false } as JsonObject, readOnly: false },
      { bridgeConfig: {} as JsonObject, readOnly: true },
    ]) {
      const controller = new SeatLayerPickerController();
      apply(controller, {
        ...snapshot(1, {}, [{ id: 'A1', label: 'A1', objectId: 'A1' }]),
        ticketCount: 1,
        cartLines: [{ lineKey: 'A1', label: 'A1', objectId: 'A1', objectType: 'seat', categoryKey: 'standard', seatId: 'A1', quantity: 1, unitPrice: 25, currency: 'USD' }],
      } as SeatLayerPickerSnapshot);
      const capture: Capture = { current: undefined };
      let tree!: TestRenderer.ReactTestRenderer;
      await act(async () => { tree = TestRenderer.create(treeFor(controller, capture, options)); });
      const current = capture.current!;
      expect(current.snapshot?.selection).toHaveLength(1);
      expect(current.pendingSeat).toBeNull();
      expect(current.presentation.pendingConfirmation).toBeNull();
      expect(projectSeatLayerCartSheet(current.snapshot, current.pendingSeat).confirmed).toMatchObject({ quantity: 1, total: 25 });
      expect(current.canHandleBack()).toBe(false);
      await expect(current.back()).resolves.toEqual({ type: 'delegateToHost' });
      act(() => tree.unmount());
      controller.dispose();
    }
  });

  it('does not carry an answered confirmation across a bridge-policy replacement', async () => {
    const controller = new SeatLayerPickerController();
    apply(controller, snapshot(1, {}, [{ id: 'A1', label: 'A1', objectId: 'A1' }]));
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture)); });
    expect(capture.current!.pendingSeat?.id).toBe('A1');
    act(() => { capture.current!.confirmPending(); });
    const priorSession = capture.current!.sessionId;
    await act(async () => {
      tree.update(treeFor(controller, capture, { bridgeConfig: { confirmSelection: false } }));
    });
    expect(capture.current!.sessionId).toBeGreaterThan(priorSession);
    expect(capture.current!.pendingSeat).toBeNull();
    expect(capture.current!.presentation.pendingConfirmation).toBeNull();
    act(() => tree.unmount());
    controller.dispose();
  });
  it('retries a failed runtime without replacing its controller or retaining stale chrome', async () => {
    const controller = new SeatLayerPickerController();
    apply(controller, snapshot(1, {}, [{ id: 'A1', label: 'A1', objectId: 'A1' }]));
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture)); });
    const priorSession = capture.current!.sessionId;
    const priorController = capture.current!.controller;
    act(() => {
      capture.current!.reportError(new Error('initial load failed'));
      capture.current!.setPresentation({ type: 'setSheet', sheet: 'expanded' });
    });
    expect(capture.current!.error).toBeInstanceOf(Error);
    expect(capture.current!.presentation.sheet).toBe('expanded');

    await act(async () => { await capture.current!.retry(); });

    expect(controller.getReloadGeneration()).toBe(1);
    expect(capture.current!.controller).toBe(priorController);
    expect(capture.current!.sessionId).toBeGreaterThan(priorSession);
    expect(capture.current!.error).toBeUndefined();
    expect(capture.current!.isReady).toBe(false);
    expect(capture.current!.pendingSeat).toBeNull();
    expect(capture.current!.presentation.sheet).toBe('collapsed');
    act(() => tree.unmount());
    controller.dispose();
  });
  it('routes the scope lifecycle through the availability sink so a lifecycle lapse needs no refresh', async () => {
    const { controller, transport } = await readyLifecycleController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture)); });
    await act(async () => { apply(controller, { ...snapshot(2), hold: { active: true, owner: 'host' } }); });
    await act(async () => { capture.current!.markReady(); });
    const lifecycle = transport.commands()[0]!;
    expect(lifecycle.type).toBe('picker.lifecycle');
    await act(async () => {
      replyLifecycle(controller, lifecycle, {
        revision: 1,
        holdLapsed: true,
        lapsedLabels: ['A-2', 'A-1'],
        recoverableLabels: ['A-2', 'A-1'],
      });
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(transport.commands().filter((frame) => frame.type === 'picker.refreshAvailability')).toHaveLength(0);
    expect(capture.current!.holdLapse).toMatchObject({
      lapsedLabels: ['A-2', 'A-1'],
      recoverableLabels: ['A-2', 'A-1'],
    });
    expect(capture.current!.holdLapsed).toBe(true);
    const recover = capture.current!.reselectHoldLapse();
    await act(async () => { await Promise.resolve(); });
    const select = transport.commands()[1]!;
    expect(select).toMatchObject({ type: 'picker.selectObjects', payload: { objects: ['A-2', 'A-1'] } });
    await act(async () => { replyLifecycle(controller, select, { revision: 1 }); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    const hold = transport.commands()[2]!;
    expect(hold.type).toBe('picker.holdSelection');
    await act(async () => { replyLifecycle(controller, hold, { revision: 1 }); await expect(recover).resolves.toBe(true); });
    expect(capture.current!.holdLapse).toBeUndefined();
    expect(capture.current!.holdLapsed).toBe(true);
    act(() => tree.unmount());
    controller.dispose();
  });

  it('uses the configured foreground fallback once without changing lifecycle reporting', async () => {
    const enabled = await readyLifecycleController();
    const enabledCapture: Capture = { current: undefined };
    let enabledTree!: TestRenderer.ReactTestRenderer;
    await act(async () => { enabledTree = TestRenderer.create(treeFor(enabled.controller, enabledCapture)); });
    await act(async () => { enabledCapture.current!.markReady(); });
    expect(enabled.transport.commands().map((command) => command.type)).toEqual(['picker.lifecycle']);
    await act(async () => { replyLifecycle(enabled.controller, enabled.transport.commands()[0]!, { revision: 1 }); await Promise.resolve(); });
    expect(enabled.transport.commands().map((command) => command.type)).toEqual(['picker.lifecycle', 'picker.refreshAvailability']);
    await act(async () => { replyLifecycle(enabled.controller, enabled.transport.commands()[1]!, { snapshot: snapshot(2) }); await Promise.resolve(); });
    expect(enabled.transport.commands().filter((command) => command.type === 'picker.getSnapshot')).toHaveLength(0);
    act(() => enabledTree.unmount()); enabled.controller.dispose();

    const disabled = await readyLifecycleController();
    const disabledCapture: Capture = { current: undefined };
    let disabledTree!: TestRenderer.ReactTestRenderer;
    await act(async () => { disabledTree = TestRenderer.create(treeFor(disabled.controller, disabledCapture, { refreshOnResume: false })); });
    await act(async () => { disabledCapture.current!.markReady(); });
    expect(disabled.transport.commands().map((command) => command.type)).toEqual(['picker.lifecycle']);
    await act(async () => { replyLifecycle(disabled.controller, disabled.transport.commands()[0]!, { revision: 1 }); await Promise.resolve(); });
    expect(disabled.transport.commands().filter((command) => command.type === 'picker.refreshAvailability')).toHaveLength(0);
    expect(disabled.transport.commands().filter((command) => command.type === 'picker.getSnapshot')).toHaveLength(1);
    await act(async () => { replyLifecycle(disabled.controller, disabled.transport.commands()[1]!, { snapshot: snapshot(2) }); await Promise.resolve(); });
    act(() => disabledTree.unmount()); disabled.controller.dispose();
  });

  it('keeps the scope countdown condemned when a buyer dismisses its lapse notice', async () => {
    const { controller, transport } = await readyLifecycleController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture)); });
    await act(async () => { capture.current!.markReady(); });
    await act(async () => {
      replyLifecycle(controller, transport.commands()[0]!, {
        revision: 1, holdLapsed: true,
        lapsedLabels: ['A-1'], recoverableLabels: ['A-1'],
      });
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(capture.current!.holdLapsed).toBe(true);
    act(() => { capture.current!.dismissHoldLapse(); });
    expect(capture.current!.holdLapse).toBeUndefined();
    expect(capture.current!.holdLapsed).toBe(true);
    act(() => tree.unmount());
    controller.dispose();
  });

  it('consumes a recovered lapse even when hold-selection is unavailable', async () => {
    const { controller, transport } = await readyLifecycleController({ holdSelection: false });
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture)); });
    await act(async () => { capture.current!.markReady(); });
    await act(async () => {
      replyLifecycle(controller, transport.commands()[0]!, {
        revision: 1, holdLapsed: true,
        lapsedLabels: ['A-1'], recoverableLabels: ['A-1'],
      });
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const recovery = capture.current!.reselectHoldLapse();
    await act(async () => { await Promise.resolve(); });
    expect(transport.commands()[1]).toMatchObject({ type: 'picker.selectObjects', payload: { objects: ['A-1'] } });
    await act(async () => { replyLifecycle(controller, transport.commands()[1]!, { revision: 1 }); await expect(recovery).resolves.toBe(true); });
    expect(transport.commands().filter((frame) => frame.type === 'picker.holdSelection')).toHaveLength(0);
    expect(capture.current!.holdLapse).toBeUndefined();
    expect(capture.current!.holdLapsed).toBe(true);
    act(() => tree.unmount());
    controller.dispose();
  });

  it('keeps a failed recovery consumed instead of resurrecting its lapse notice', async () => {
    const { controller, transport } = await readyLifecycleController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture)); });
    await act(async () => { capture.current!.markReady(); });
    await act(async () => {
      replyLifecycle(controller, transport.commands()[0]!, {
        revision: 1, holdLapsed: true,
        lapsedLabels: ['A-1'], recoverableLabels: ['A-1'],
      });
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const recovery = capture.current!.reselectHoldLapse();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { rejectLifecycle(controller, transport.commands()[1]!); await expect(recovery).resolves.toBe(false); });
    expect(capture.current!.holdLapse).toBeUndefined();
    expect(capture.current!.holdLapsed).toBe(true);
    act(() => tree.unmount());
    controller.dispose();
  });

  it('does not let a retained recovery callback join a replacement scope session', async () => {
    const first = await readyLifecycleController();
    const second = await readyLifecycleController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(first.controller, capture)); });
    await act(async () => { capture.current!.markReady(); });
    await act(async () => {
      replyLifecycle(first.controller, first.transport.commands()[0]!, {
        revision: 1, holdLapsed: true,
        lapsedLabels: ['A-1'], recoverableLabels: ['A-1'],
      });
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const retired = capture.current!.reselectHoldLapse;
    await act(async () => { tree.update(treeFor(second.controller, capture)); });
    await expect(retired()).resolves.toBe(false);
    expect(second.transport.commands().filter((frame) => frame.type === 'picker.selectObjects')).toHaveLength(0);
    act(() => tree.unmount());
    first.controller.dispose();
    second.controller.dispose();
  });

  it('keeps equivalent inline boot props, prompt and inset leases without a replacement', async () => {
    const controller = new SeatLayerPickerController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture, { bridgeConfig: { mode: 'a' } })); });
    const original = capture.current!;
    const band = original.claimViewportInsetBand('header');
    const prompt = original.claimPrompt('access', 'accessibility')!;
    act(() => { band.set({ top: 56 }); prompt.open(); });
    await act(async () => { tree.update(treeFor(controller, capture, { bridgeConfig: { mode: 'a' } })); });
    expect(capture.current!.sessionId).toBe(original.sessionId);
    expect(capture.current!.controller).toBe(controller);
    expect(capture.current!.presentation.prompt).toMatchObject({ kind: 'accessibility' });
    act(() => { expect(prompt.dismiss()).toBe(true); });
    act(() => {
      (capture.current!.setPresentation as unknown as (event: { type: 'openPrompt'; prompt: { kind: string } }) => void)(
        { type: 'openPrompt', prompt: { kind: 'cart' } },
      );
    });
    expect(capture.current!.presentation.prompt).toBeNull();
    act(() => tree.unmount());
  });

  it('rejects hostile candidates without retiring the accepted prompt, band or controller', async () => {
    const controller = new SeatLayerPickerController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture)); });
    const accepted = capture.current!;
    const band = accepted.claimViewportInsetBand('header');
    const prompt = accepted.claimPrompt('access', 'accessibility')!;
    act(() => { band.set({ top: 56 }); prompt.open(); });
    const hostile = {} as { event: string };
    Object.defineProperty(hostile, 'event', { enumerable: true, get: () => { throw new Error('getter'); } });
    await act(async () => {
      tree.update(React.createElement(
        SeatLayerPickerScope,
        { configuration: hostile as never, controller },
        React.createElement(Probe, { capture }),
      ));
    });
    expect(capture.current!.controller).toBe(controller);
    expect(capture.current!.sessionId).toBe(accepted.sessionId);
    act(() => { expect(prompt.dismiss()).toBe(true); });
    act(() => tree.unmount());
  });

  it('keeps the accepted session when a replacement controller is already borrowed', async () => {
    const acceptedController = new SeatLayerPickerController();
    const blockedController = new SeatLayerPickerController();
    const accepted: Capture = { current: undefined };
    const blocker: Capture = { current: undefined };
    let acceptedTree!: TestRenderer.ReactTestRenderer;
    let blockerTree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      acceptedTree = TestRenderer.create(treeFor(acceptedController, accepted));
      blockerTree = TestRenderer.create(treeFor(blockedController, blocker));
    });
    const prior = accepted.current!;
    const prompt = prior.claimPrompt('access', 'accessibility')!;
    act(() => { prompt.open(); });
    await act(async () => { acceptedTree.update(treeFor(blockedController, accepted)); });
    expect(accepted.current!.controller).toBe(acceptedController);
    expect(accepted.current!.sessionId).toBe(prior.sessionId);
    expect(accepted.current!.presentation.prompt).toMatchObject({ kind: 'accessibility' });
    act(() => { expect(prompt.dismiss()).toBe(true); });
    act(() => { acceptedTree.unmount(); blockerTree.unmount(); });
  });

  it('retires logical chrome ownership for accepted bridge/read-only boot changes', async () => {
    insets.reset();
    const controller = new SeatLayerPickerController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture, { bridgeConfig: { theme: 'one' } })); });
    const old = capture.current!;
    const band = old.claimViewportInsetBand('header');
    const prompt = old.claimPrompt('access', 'accessibility')!;
    act(() => { band.set({ top: 56 }); prompt.open(); });
    await act(async () => { tree.update(treeFor(controller, capture, { bridgeConfig: { theme: 'two' }, readOnly: true })); });
    expect(capture.current!.controller).toBe(controller);
    expect(capture.current!.sessionId).toBeGreaterThan(old.sessionId);
    expect(capture.current!.presentation.prompt).toBeNull();
    expect(prompt.open()).toBe(false);
    band.set({ top: 90 });
    expect(insets.calls).not.toContain('set:header:90');
    act(() => tree.unmount());
  });

  it('retires old scope callbacks and bands only after a validated session replacement', async () => {
    insets.reset();
    const first = new SeatLayerPickerController();
    const second = new SeatLayerPickerController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(first, capture)); });
    const old = capture.current!;
    const oldBand = old.claimViewportInsetBand('header');
    const oldPrompt = old.claimPrompt('access', 'accessibility')!;
    act(() => { oldBand.set({ top: 56 }); oldPrompt.open(); });
    await act(async () => { tree.update(treeFor(second, capture)); });
    expect(capture.current!.controller).toBe(second);
    expect(capture.current!.presentation.prompt).toBeNull();
    expect(oldPrompt.open()).toBe(false);
    oldBand.set({ top: 99 }); oldBand.remove();
    expect(insets.calls).not.toContain('set:header:99');
    expect(insets.calls.filter((entry) => entry === 'set:header:56')).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('syncs authoritative map rung/focus without equivalent churn and resets it on session replacement', async () => {
    const first = new SeatLayerPickerController();
    const second = new SeatLayerPickerController();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(first, capture)); });
    await act(async () => { apply(first, snapshot(1, { rung: 'seats', focusedSectionId: 'A' })); });
    const focused = capture.current!.presentation;
    expect(focused).toMatchObject({ mapRung: 'seats', focusedSection: { sectionId: 'A' }, isOverview: false });
    await act(async () => { apply(first, snapshot(2, { rung: 'seats', focusedSectionId: 'A' })); });
    expect(capture.current!.presentation).toBe(focused);
    await act(async () => { tree.update(treeFor(second, capture)); });
    expect(capture.current!.presentation).toMatchObject({ mapRung: 'overview', focusedSection: null, isOverview: true });
    act(() => tree.unmount());
  });

  it('uses exact context identity in scope reprovision and Android modal dismissal', async () => {
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(new SeatLayerPickerController(), capture, { reprovider: true, modal: true })); });
    expect(tree.root.findByType('reprovided-probe' as never).props.same).toBe(true);
    expect(tree.root.findByType('modal-identity-probe' as never).props.same).toBe(true);
    const prompt = capture.current!.claimPrompt('access', 'accessibility')!;
    act(() => { prompt.open(); });
    act(() => tree.root.findByType('Modal' as never).props.onRequestClose());
    await act(async () => undefined);
    expect(capture.current!.presentation.prompt).toBeNull();
    act(() => tree.unmount());
  });

  it('uses the live pending/in-flight state for hardware Back and delegates overview', async () => {
    native.reset();
    const controller = new SeatLayerPickerController();
    let release!: () => void;
    (controller as unknown as { deselectObjects(labels: string[]): Promise<unknown> }).deselectObjects = vi.fn(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(controller, capture, { hardware: true })); });
    act(() => { expect(native.fire()).toBe(false); });
    act(() => apply(controller, snapshot(1, {}, [{ id: 'A1', label: 'A1', objectId: 'A1' }])));
    act(() => { expect(native.fire()).toBe(true); });
    act(() => { expect(native.fire()).toBe(true); });
    act(() => { release(); });
    await act(async () => undefined);
    act(() => { expect(native.fire()).toBe(false); });
    act(() => tree.unmount());
    act(() => { expect(native.fire()).toBe(false); });
  });

  it('keeps the stable hardware Back listener live after a scope session replacement', async () => {
    native.reset();
    const first = new SeatLayerPickerController();
    const second = new SeatLayerPickerController();
    const zoomOut = vi.spyOn(second, 'zoomOut').mockResolvedValue(undefined);
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(first, capture, { hardware: true })); });
    await act(async () => { tree.update(treeFor(second, capture, { hardware: true })); });
    act(() => { apply(second, snapshot(1, { rung: 'seats', focusedSectionId: 'A' })); });
    act(() => { expect(native.fire()).toBe(true); });
    await act(async () => undefined);
    expect(zoomOut).toHaveBeenCalledOnce();
    expect(native.addEventListener).toHaveBeenCalledOnce();
    act(() => tree.unmount());
  });

  it('clears command busy state when an accepted replacement retires the old flight', async () => {
    const first = new SeatLayerPickerController();
    const second = new SeatLayerPickerController();
    let release!: () => void;
    vi.spyOn(first, 'zoomOut').mockImplementation(
      () => new Promise<undefined>((resolve) => { release = () => resolve(undefined); }),
    );
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(treeFor(first, capture)); });
    act(() => { apply(first, snapshot(1, { rung: 'seats', focusedSectionId: 'A' })); });
    let oldFlight!: Promise<unknown>;
    act(() => { oldFlight = capture.current!.back(); });
    expect(capture.current!.isBusy).toBe(true);
    await act(async () => { tree.update(treeFor(second, capture)); });
    expect(capture.current!.isBusy).toBe(false);
    release();
    await act(async () => { await oldFlight; });
    expect(capture.current!.isBusy).toBe(false);
    act(() => tree.unmount());
  });

  it('clears claimed inset bands when a borrowed scope unmounts', async () => {
    insets.reset();
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(treeFor(new SeatLayerPickerController(), capture));
    });
    const band = capture.current!.claimViewportInsetBand('header');
    act(() => { band.set({ top: 56 }); });
    act(() => tree.unmount());
    expect(insets.calls).toContain('remove:header');
  });

  it('contains malformed public presentation and prompt-owner inputs', async () => {
    const capture: Capture = { current: undefined };
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(treeFor(new SeatLayerPickerController(), capture));
    });
    const hostile = {};
    Object.defineProperty(hostile, 'type', {
      enumerable: true,
      get: () => { throw new Error('presentation getter'); },
    });
    expect(() => {
      (capture.current!.setPresentation as unknown as (event: unknown) => void)(hostile);
    }).not.toThrow();
    const descriptorTrap = new Proxy({}, {
      getOwnPropertyDescriptor() { throw new Error('presentation proxy descriptor'); },
    });
    expect(() => {
      (capture.current!.setPresentation as unknown as (event: unknown) => void)(descriptorTrap);
    }).not.toThrow();
    expect(() => {
      (capture.current!.claimPrompt as unknown as (owner: unknown, kind: unknown) => unknown)(1, 'cart');
    }).not.toThrow();
    act(() => tree.unmount());
  });
});
