import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState, useColorScheme } from 'react-native';

import type { JsonObject } from '../json';
import type { ReadyInfo, SeatLayerConfiguration } from '../types';
import {
  SeatLayerPickerBackCoordinator,
  type SeatLayerPickerBackAction,
} from './backNavigation';
import { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerSnapshot } from './models';
import { formatSeatLayerPickerMoney } from './format';
import { resolveSeatLayerPickerPricing } from './options';
import {
  applyPendingConfirmationSnapshot,
  confirmPending as confirmPendingState,
  initialPendingConfirmationState,
  resetPendingConfirmationState, seatLayerPickerPendingConfirmationPolicy,
} from './pendingConfirmationState';
import { SeatLayerPickerPendingCancelCoordinator } from './pendingConfirmationActions';
import {
  reduceSeatLayerPickerPresentationState,
  seatLayerPickerInitialPresentationState,
  type SeatLayerPickerPresentationEvent,
  type SeatLayerPickerLocalPresentationEvent,
  type SeatLayerPickerPresentationState,
} from './presentationState';
import { SeatLayerPickerScopeSession } from './scopeSession';
import {
  prepareSeatLayerPickerScopeInputs,
  replaceSeatLayerPickerScopeSession,
} from './scopeReplacement';
import { reprovideSeatLayerPickerScopeValue } from './scopeReprovider';
import { SeatLayerPickerScopeInsets } from './scopeInsets';
import { SeatLayerPickerScopeInsetBands } from './scopeInsetBands';
import { SeatLayerPickerEffectSlot } from './effectSlot';
import { SeatLayerPickerScopeCandidates } from './scopeCandidates';
import { SeatLayerPickerLifecycleCoordinator } from './scopeLifecycle';
import {
  pickerLifecycleAvailabilitySink,
  reselectSeatLayerPickerLapse,
} from './availabilityActions';
import { decodeSeatLayerPickerAvailabilityOutcome } from './availability';
import {
  seatLayerPickerConfiguredHoldTtl,
  type SeatLayerPickerHoldLapse,
} from './holdLapse';
import { SeatLayerPickerScopeHoldLapse } from './scopeHoldLapse';
import { resolveSeatLayerPickerScopeTheme } from './scopeTheme';
import {
  createSeatLayerPickerScopeStrings,
  prepareSeatLayerPickerScopeStringInputs,
  resolveSeatLayerPickerScopeStringResolution,
} from './scopeStrings';
import type { SeatLayerPickerViewportInsetInput } from './viewportInsets';
import { SeatLayerPickerInsetOwnership, type SeatLayerPickerInsetLease } from './insetOwnership';
import { SeatLayerPickerPromptOwnership } from './promptOwnership';
import type { SeatLayerPickerPromptKind } from './presentationState';
import { resolveSeatLayerPickerBackState } from './scopeBackState';
import { safeSeatLayerPickerPresentationInput } from './scopePresentationInput';
import type { SeatLayerChartLoadListener } from './chartLoadSubscription';
import {
  SeatLayerPickerScopeContext,
  useSeatLayerPickerScopeContext,
} from './pickerScopeContext';
import type {
  SeatLayerPickerAvailability,
  SeatLayerPickerScopeProps,
  SeatLayerPickerScopeValue,
} from './pickerScopeTypes';
export type {
  SeatLayerPickerAvailability,
  SeatLayerPickerScopeProps,
  SeatLayerPickerScopeValue,
} from './pickerScopeTypes';

function fallbackFrame(callback: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(callback, 0);
}

function scopeFrameScheduler() {
  const host = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: () => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  return {
    requestAnimationFrame: host.requestAnimationFrame ?? fallbackFrame,
    cancelAnimationFrame: host.cancelAnimationFrame ?? clearTimeout,
  };
}

function availabilityOf(
  controller: SeatLayerPickerController,
): SeatLayerPickerAvailability {
  return Object.freeze({
    floorStack: controller.supportsFloorStack,
    viewportInsets: controller.supportsViewportInsets,
    venue3D: controller.supportsVenue3D,
    seatView: controller.supportsSeatView,
    nativeSeatViewChrome: controller.supportsNativeSeatViewChrome,
  });
}

function mapPresentation(
  state: SeatLayerPickerPresentationState,
  event: SeatLayerPickerPresentationEvent,
): SeatLayerPickerPresentationState {
  return reduceSeatLayerPickerPresentationState(state, event);
}

/** Provides one controller and one immutable snapshot stream to a custom picker layout. */
export function SeatLayerPickerScope(props: SeatLayerPickerScopeProps): React.ReactElement {
  const {
    configuration,
    controller: suppliedController,
    bridgeConfig,
    themeMode = 'auto',
    themeOptions,
    styles: suppliedStyles = {},
    pricing: suppliedPricing,
    readOnly = false, refreshOnResume = true,
    onChartLoad,
    children,
  } = props;
  const stringInputs = prepareSeatLayerPickerScopeStringInputs(props);
  const sessionRef = useRef<SeatLayerPickerScopeSession | undefined>(undefined);
  const initialInputsRef = useRef<{
    readonly configuration: SeatLayerConfiguration;
    readonly bridgeConfig: JsonObject;
    readonly readOnly: boolean;
    readonly error: unknown;
  } | undefined>(undefined);
  if (initialInputsRef.current === undefined) {
    let initialError: unknown;
    const inputs = prepareSeatLayerPickerScopeInputs(
      configuration,
      bridgeConfig,
      readOnly,
      suppliedController,
      (nextError) => { initialError = nextError; },
    );
    initialInputsRef.current = inputs === undefined
      ? Object.freeze({
          configuration: Object.freeze({ event: '' }),
          bridgeConfig: Object.freeze({}),
          readOnly: false,
          error: initialError,
        })
      : Object.freeze({ ...inputs, error: undefined });
  }
  const initialInputs = initialInputsRef.current!;
  if (sessionRef.current === undefined) {
    sessionRef.current = new SeatLayerPickerScopeSession(
      initialInputs.error === undefined ? suppliedController : undefined,
    );
  }
  const session = sessionRef.current;
  const candidatesRef = useRef(new SeatLayerPickerScopeCandidates({
    inputs: initialInputs,
    controller: suppliedController,
  }, initialInputs.error === undefined));
  const [activeController, setActiveController] = useState(
    session.currentController,
  );
  const [activeConfiguration, setActiveConfiguration] = useState(initialInputs.configuration);
  const [activeBridgeConfig, setActiveBridgeConfig] = useState(initialInputs.bridgeConfig);
  const [activeReadOnly, setActiveReadOnly] = useState(initialInputs.readOnly);
  const [sessionId, setSessionId] = useState(0);
  const generationRef = useRef(0);
  const aliveRef = useRef(true);
  const ownershipEpochRef = useRef(0);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [error, setError] = useState<unknown>(initialInputs.error);
  const [busy, setBusy] = useState(false);
  const [holdLapsed, setHoldLapsed] = useState(false);
  const [holdLapse, setHoldLapse] = useState<SeatLayerPickerHoldLapse | undefined>();
  const [holdLapseBusy, setHoldLapseBusy] = useState(false);
  const holdLapseRef = useRef(new SeatLayerPickerScopeHoldLapse());
  const holdLapseFlightRef = useRef<{
    readonly generation: number;
    readonly promise: Promise<boolean>;
  } | undefined>(undefined);
  const backCoordinatorRef = useRef(new SeatLayerPickerBackCoordinator());
  const insetDispatchRef = useRef<{
    set: ((band: string, insets: SeatLayerPickerViewportInsetInput) => void) | undefined;
    remove: ((band: string) => void) | undefined;
  }>({ set: undefined, remove: undefined });
  const insetOwnershipRef = useRef(new SeatLayerPickerInsetOwnership(
    (band, insets) => insetDispatchRef.current.set?.(band, insets),
    (band) => insetDispatchRef.current.remove?.(band),
  ));
  const promptOwnershipRef = useRef(new SeatLayerPickerPromptOwnership());
  const pendingCancelCoordinatorRef = useRef<
    SeatLayerPickerPendingCancelCoordinator | undefined
  >(undefined);
  const [presentation, setPresentation] = useReducer(
    mapPresentation,
    seatLayerPickerInitialPresentationState,
  );
  const ownershipEpoch = ownershipEpochRef.current;
  const presentationForScope = presentation;
  const presentationRef = useRef(presentationForScope);
  presentationRef.current = presentationForScope;
  const setScopedPresentation = useCallback((event: SeatLayerPickerLocalPresentationEvent) => {
    const safe = safeSeatLayerPickerPresentationInput(event);
    if (safe !== undefined && aliveRef.current && generationRef.current === sessionId) setPresentation(safe);
  }, [sessionId]);
  const [pendingConfirmation, setPendingConfirmation] = useState(
    initialPendingConfirmationState,
  );
  const pendingRef = useRef(pendingConfirmation);
  pendingRef.current = pendingConfirmation;
  const snapshot = useSyncExternalStore(
    activeController.subscribe,
    activeController.getSnapshot,
    activeController.getSnapshot,
  );
  const reloadGeneration = useSyncExternalStore(
    activeController.subscribeReload,
    activeController.getReloadGeneration,
    activeController.getReloadGeneration,
  );
  const deviceMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const pendingConfirmationPolicy = useMemo(() => seatLayerPickerPendingConfirmationPolicy(activeBridgeConfig, activeReadOnly), [activeBridgeConfig, activeReadOnly]);
  const resolvedTheme = useMemo(
    () =>
      resolveSeatLayerPickerScopeTheme(themeOptions, themeMode, deviceMode, snapshot),
    [deviceMode, snapshot, themeMode, themeOptions],
  );
  const stringResolution = resolveSeatLayerPickerScopeStringResolution(
    stringInputs,
    snapshot,
    activeConfiguration,
  );
  const strings = useMemo(
    () => createSeatLayerPickerScopeStrings(stringResolution),
    [
      stringResolution.locale,
      stringResolution.overrideKey,
    ],
  );
  const reportError = useCallback((nextError: unknown) => {
    if (aliveRef.current && generationRef.current === sessionId) setError(nextError);
  }, [sessionId]);
  const pricing = useMemo(
    () => resolveSeatLayerPickerPricing(suppliedPricing),
    [suppliedPricing],
  );
  const formatMoney = useCallback(
    (amount: number, currency: string) =>
      formatSeatLayerPickerMoney(amount, currency, pricing?.formatter, reportError),
    [pricing?.formatter, reportError],
  );
  const clearError = useCallback(() => {
    if (aliveRef.current && generationRef.current === sessionId) setError(undefined);
  }, [sessionId]);
  const isSessionActive = useCallback(
    () => aliveRef.current && generationRef.current === sessionId,
    [sessionId],
  );
  useLayoutEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  const lifecycleSlotRef = useRef(
    new SeatLayerPickerEffectSlot<SeatLayerPickerLifecycleCoordinator>(),
  );
  const insetSlotRef = useRef(
    new SeatLayerPickerEffectSlot<SeatLayerPickerScopeInsets>(),
  );
  useLayoutEffect(() => {
    session.attach();
    return () => session.release();
  }, [session, activeController]);

  useLayoutEffect(() => {
    activeController.beginChartLoadAttempt();
  }, [activeController, sessionId]);

  useLayoutEffect(() => {
    const generation = sessionId;
    if (onChartLoad === undefined) return undefined;
    return activeController.subscribeChartLoad((load) => {
      if (!aliveRef.current || generationRef.current !== generation) return;
      return onChartLoad(load);
    });
  }, [activeController, onChartLoad, sessionId]);

  useLayoutEffect(() => {
    const nextInputs = prepareSeatLayerPickerScopeInputs(
      configuration,
      bridgeConfig,
      readOnly,
      suppliedController,
      reportError,
    );
    if (nextInputs === undefined) return;
    const candidate = { inputs: nextInputs, controller: suppliedController };
    const candidates = candidatesRef.current;
    if (!candidates.see(candidate)) return;
    if (candidates.isAccepted(candidate)) {
      clearError();
      return;
    }
    const suppliedChanged = candidates.currentAccepted?.controller !== suppliedController;
    const eventChanged = nextInputs.configuration.event !== activeConfiguration.event;
    if (eventChanged && !suppliedChanged && !session.ownsCurrentController) {
      reportError(
        new Error('Changing a borrowed picker event requires a replacement controller.'),
      );
      return;
    }
    if ((suppliedChanged || eventChanged) &&
      !replaceSeatLayerPickerScopeSession(session, suppliedController, reportError)) {
      return;
    }
    // Every accepted boot-input revision is a logical chrome session.  This
    // retires bands/prompts before paint even when the controller is retained.
    ownershipEpochRef.current += 1;
    promptOwnershipRef.current.reset();
    insetOwnershipRef.current?.reset();
    insetBandsRef.current.clear();
    snapshotPresentationKeyRef.current = undefined;
    generationRef.current += 1;
    backCoordinatorRef.current.reset();
    pendingCancelCoordinatorRef.current?.dispose();
    holdLapseRef.current.reset();
    holdLapseFlightRef.current = undefined;
    setHoldLapsed(false);
    setHoldLapse(undefined);
    setHoldLapseBusy(false);
    setBusy(false);
    candidates.accept(candidate);
    readyRef.current = false;
    setReady(false);
    setActiveConfiguration(nextInputs.configuration);
    setActiveBridgeConfig(nextInputs.bridgeConfig);
    setActiveReadOnly(nextInputs.readOnly);
    setError(undefined);
    setPresentation({ type: 'setSheet', sheet: 'collapsed' });
    setPresentation({ type: 'dismissPrompt' });
    setPresentation({ type: 'setPendingConfirmation', pendingConfirmation: null });
    setPresentation({ type: 'setFocusedSection', focusedSection: null });
    setPresentation({ type: 'setOverview', isOverview: true });
    setPresentation({ type: 'syncSnapshot', rung: 'overview', focusedSectionId: null });
    const resetPending = resetPendingConfirmationState();
    pendingRef.current = resetPending;
    setPendingConfirmation(resetPending);
    setSessionId((value) => value + 1);
    setActiveController(session.currentController);
  }, [activeConfiguration.event, bridgeConfig, configuration, readOnly, reportError, session, suppliedController]);

  const acceptHoldLapseOutcome = useCallback((rawOutcome: unknown) => {
    if (!aliveRef.current || generationRef.current !== sessionId) return;
    const outcome = decodeSeatLayerPickerAvailabilityOutcome(rawOutcome);
    if (!outcome) return;
    setHoldLapse(holdLapseRef.current.accept(
      outcome,
      seatLayerPickerConfiguredHoldTtl(activeBridgeConfig),
      activeController.getSnapshot()?.revision,
    ));
    setHoldLapsed(holdLapseRef.current.holdLapsed);
  }, [activeBridgeConfig, activeController, sessionId]);
  useEffect(() => {
    const coordinator = new SeatLayerPickerLifecycleCoordinator(
      pickerLifecycleAvailabilitySink(activeController), reportError, acceptHoldLapseOutcome, refreshOnResume,
    );
    const release = lifecycleSlotRef.current.install(coordinator);
    coordinator.setAppState(AppState.currentState ?? 'active');
    if (readyRef.current) coordinator.markReady();
    const subscription = AppState.addEventListener('change', (state) => {
      coordinator.setAppState(state);
    });
    return () => {
      subscription.remove();
      release();
    };
  }, [acceptHoldLapseOutcome, activeController, refreshOnResume, reportError, sessionId]);

  const insetBandsRef = useRef(new SeatLayerPickerScopeInsetBands());
  useEffect(() => {
    const coordinator = new SeatLayerPickerScopeInsets(
      scopeFrameScheduler(), activeController, reportError,
    );
    const release = insetSlotRef.current.install(coordinator);
    insetBandsRef.current.replay(coordinator);
    if (readyRef.current) coordinator.markReady();
    return release;
  }, [activeController, reportError, sessionId]);

  const setViewportInsetBand = useCallback(
    (band: string, insets: SeatLayerPickerViewportInsetInput) => {
      if (!aliveRef.current || generationRef.current !== sessionId) return;
      insetBandsRef.current.set(band, insets);
      insetSlotRef.current.current?.setBand(band, insets);
    },
    [sessionId],
  );
  const removeViewportInsetBand = useCallback((band: string) => {
    if (generationRef.current !== sessionId) return;
    insetBandsRef.current.remove(band);
    insetSlotRef.current.current?.removeBand(band);
  }, [sessionId]);
  insetDispatchRef.current.set = setViewportInsetBand;
  insetDispatchRef.current.remove = removeViewportInsetBand;
  const claimViewportInsetBand = useCallback(
    (band: string) => {
      if (!aliveRef.current || generationRef.current !== sessionId ||
        ownershipEpochRef.current !== ownershipEpoch) {
        return Object.freeze({ set: () => undefined, remove: () => undefined }) as SeatLayerPickerInsetLease;
      }
      return insetOwnershipRef.current.claim(band);
    }, [ownershipEpoch, sessionId],
  );
  const claimPrompt = useCallback((owner: string, kind: SeatLayerPickerPromptKind, context?: unknown) => {
    if (!aliveRef.current || generationRef.current !== sessionId ||
      ownershipEpochRef.current !== ownershipEpoch || typeof owner !== 'string' ||
      typeof kind !== 'string') return undefined;
    const lease = promptOwnershipRef.current.claim(owner, kind, context);
    if (!lease) return undefined;
    return Object.freeze({
      lease,
      open: () => {
        if (!aliveRef.current || generationRef.current !== sessionId ||
          ownershipEpochRef.current !== ownershipEpoch ||
          !promptOwnershipRef.current.isActive(lease)) return false;
        setPresentation({ type: 'openPrompt', prompt: promptOwnershipRef.current.asPresentation(lease) });
        return true;
      },
      dismiss: () => {
        if (!aliveRef.current || generationRef.current !== sessionId ||
          ownershipEpochRef.current !== ownershipEpoch ||
          !promptOwnershipRef.current.dismiss(lease)) return false;
        setPresentation({ type: 'dismissPrompt' });
        return true;
      },
    });
  }, [ownershipEpoch, sessionId]);
  useLayoutEffect(() => () => {
    promptOwnershipRef.current.reset();
    insetOwnershipRef.current.reset();
    insetBandsRef.current.clear();
  }, []);
  useEffect(() => {
    const generation = sessionId;
    const applyLatestSnapshot = () => {
      if (!aliveRef.current || generationRef.current !== generation) return;
      const latestSnapshot = activeController.getSnapshot();
      if (latestSnapshot === undefined) return;
      setHoldLapse(holdLapseRef.current.observeSnapshot(latestSnapshot));
      setHoldLapsed(holdLapseRef.current.holdLapsed);
      setPendingConfirmation((current) => {
        const next = applyPendingConfirmationSnapshot(current, latestSnapshot, pendingConfirmationPolicy);
        pendingRef.current = next;
        return next;
      });
    };
    applyLatestSnapshot();
    return activeController.subscribe(applyLatestSnapshot);
  }, [activeController, pendingConfirmationPolicy, sessionId]);
  const snapshotPresentationKeyRef = useRef<string | undefined>(undefined);
  const observedReloadRef = useRef(Object.freeze({
    controller: activeController,
    generation: reloadGeneration,
  }));
  useLayoutEffect(() => {
    const observed = observedReloadRef.current;
    observedReloadRef.current = Object.freeze({
      controller: activeController,
      generation: reloadGeneration,
    });
    if (
      observed.controller !== activeController ||
      observed.generation === reloadGeneration
    ) return;

    // Match a fresh scope session without replacing the public controller.
    // Every outstanding callback/action lease is invalid before the chart key
    // changes, so a retired runtime cannot write into the new loading state.
    ownershipEpochRef.current += 1;
    promptOwnershipRef.current.reset();
    insetOwnershipRef.current.reset();
    insetBandsRef.current.clear();
    snapshotPresentationKeyRef.current = undefined;
    generationRef.current += 1;
    backCoordinatorRef.current.reset();
    pendingCancelCoordinatorRef.current?.dispose();
    holdLapseRef.current.reset();
    holdLapseFlightRef.current = undefined;
    setHoldLapsed(false);
    setHoldLapse(undefined);
    setHoldLapseBusy(false);
    setBusy(false);
    readyRef.current = false;
    setReady(false);
    setError(undefined);
    setPresentation({ type: 'setSheet', sheet: 'collapsed' });
    setPresentation({ type: 'dismissPrompt' });
    setPresentation({ type: 'setPendingConfirmation', pendingConfirmation: null });
    setPresentation({ type: 'setFocusedSection', focusedSection: null });
    setPresentation({ type: 'setOverview', isOverview: true });
    setPresentation({ type: 'syncSnapshot', rung: 'overview', focusedSectionId: null });
    const resetPending = resetPendingConfirmationState();
    pendingRef.current = resetPending;
    setPendingConfirmation(resetPending);
    setSessionId((value) => value + 1);
  }, [activeController, reloadGeneration]);
  // Renderer-driven focus/rung is snapshot truth too: keep the native back
  // ladder synchronized without allocating equivalent focus state repeatedly.
  useEffect(() => {
    if (!snapshot || !aliveRef.current || generationRef.current !== sessionId) return;
    const focused = snapshot.map.focusedSectionId ?? snapshot.map.focusedSection?.id ?? null;
    const key = `${sessionId}:${snapshot.map.rung}:${focused ?? ''}`;
    if (snapshotPresentationKeyRef.current === key) return;
    snapshotPresentationKeyRef.current = key;
    setPresentation({ type: 'syncSnapshot', rung: snapshot.map.rung, focusedSectionId: focused });
  }, [sessionId, snapshot?.map.focusedSection, snapshot?.map.focusedSectionId, snapshot?.map.rung]);
  useEffect(() => {
    if (!aliveRef.current || generationRef.current !== sessionId) return;
    setPresentation({
      type: 'setPendingConfirmation',
      pendingConfirmation: pendingConfirmation.pending === null
        ? null
        : { context: pendingConfirmation.pending },
    });
  }, [pendingConfirmation.pending, sessionId]);
  const pendingCancelCoordinator = useMemo(
    () =>
      new SeatLayerPickerPendingCancelCoordinator(activeController, {
        getState: () => pendingRef.current,
        setState: (nextState) => {
          if (!aliveRef.current || generationRef.current !== sessionId) return;
          pendingRef.current = nextState;
          setPendingConfirmation(nextState);
        },
        setBusy: (nextBusy) => {
          if (aliveRef.current && generationRef.current === sessionId) setBusy(nextBusy);
        },
        reportError,
      }),
    [activeController, reportError, sessionId],
  );
  pendingCancelCoordinatorRef.current = pendingCancelCoordinator;
  const markReady = useCallback((info?: ReadyInfo) => {
    if (!aliveRef.current || generationRef.current !== sessionId) return;
    activeController.markChartLoadReady(info);
    readyRef.current = true;
    setReady(true);
    insetSlotRef.current.current?.markReady();
    lifecycleSlotRef.current.current?.markReady();
  }, [activeController, sessionId]);
  const subscribeChartLoad = useCallback(
    (listener: SeatLayerChartLoadListener) => {
      const generation = sessionId;
      return activeController.subscribeChartLoad((load) => {
        if (!aliveRef.current || generationRef.current !== generation) return;
        return listener(load);
      });
    },
    [activeController, sessionId],
  );
  const retry = useCallback((): Promise<void> => activeController.retry(), [activeController]);
  const confirmPending = useCallback(() => {
    if (!aliveRef.current || generationRef.current !== sessionId) return;
    setPendingConfirmation((current) => {
      const next = confirmPendingState(current);
      pendingRef.current = next;
      return next;
    });
  }, [sessionId]);
  const cancelPending = useCallback(
    (): Promise<boolean> => pendingCancelCoordinator.cancel(),
    [pendingCancelCoordinator],
  );
  const dismissHoldLapse = useCallback(() => {
    if (!aliveRef.current || generationRef.current !== sessionId) return;
    setHoldLapse(holdLapseRef.current.dismiss());
    setHoldLapsed(holdLapseRef.current.holdLapsed);
  }, [sessionId]);
  const reselectHoldLapse = useCallback((): Promise<boolean> => {
    const generation = sessionId;
    if (!aliveRef.current || generationRef.current !== generation) {
      return Promise.resolve(false);
    }
    const existing = holdLapseFlightRef.current;
    if (existing) {
      return existing.generation === generation ? existing.promise : Promise.resolve(false);
    }
    const lapse = holdLapseRef.current.value;
    const labels = lapse?.recoverableLabels ?? [];
    if (
      !ready || activeReadOnly || busy || labels.length === 0 ||
      !holdLapseRef.current.consume(lapse!.key)
    ) return Promise.resolve(false);
    setHoldLapse(undefined);
    setHoldLapsed(holdLapseRef.current.holdLapsed);
    setHoldLapseBusy(true);
    const flight = reselectSeatLayerPickerLapse(
      activeController,
      labels,
      seatLayerPickerConfiguredHoldTtl(activeBridgeConfig),
    ).then(
      () => {
        if (!aliveRef.current || generationRef.current !== generation) return false;
        if (holdLapseRef.current.matches(lapse!.key)) {
          setHoldLapse(holdLapseRef.current.observeSnapshot(activeController.getSnapshot()));
          setHoldLapsed(holdLapseRef.current.holdLapsed);
        }
        return true;
      },
      (nextError) => {
        if (aliveRef.current && generationRef.current === generation) reportError(nextError);
        return false;
      },
    ).finally(() => {
      if (holdLapseFlightRef.current?.promise === flight) holdLapseFlightRef.current = undefined;
      if (aliveRef.current && generationRef.current === generation) setHoldLapseBusy(false);
    });
    holdLapseFlightRef.current = { generation, promise: flight };
    return flight;
  }, [activeBridgeConfig, activeController, activeReadOnly, busy, ready, reportError, sessionId]);
  const effectiveBackState = useCallback((): SeatLayerPickerPresentationState => {
    return resolveSeatLayerPickerBackState(
      presentationRef.current, activeController.getSnapshot(), pendingRef.current.pending,
    );
  }, [activeController]);
  const canHandleBack = useCallback(() => {
    if (!aliveRef.current || generationRef.current !== sessionId ||
      ownershipEpochRef.current !== ownershipEpoch) return false;
    return backCoordinatorRef.current.wouldConsume(
      effectiveBackState(), pendingCancelCoordinator.isInFlight,
    );
  }, [effectiveBackState, ownershipEpoch, pendingCancelCoordinator.isInFlight, sessionId]);
  const back = useCallback(async (): Promise<SeatLayerPickerBackAction> => {
    const generation = sessionId;
    if (!aliveRef.current || generationRef.current !== generation ||
      ownershipEpochRef.current !== ownershipEpoch) return { type: 'delegateToHost' };
    const coordinator = backCoordinatorRef.current;
    const pendingCoordinator = pendingCancelCoordinator;
    const stateForBack = effectiveBackState();
    const result = coordinator.begin(
      stateForBack,
      pendingCoordinator.isInFlight,
    );
    if (!result.started) return result.action;
    if (result.action.type === 'dismissPrompt' || result.action.type === 'collapseSheet') {
      if (result.action.type === 'dismissPrompt') promptOwnershipRef.current.dismissActive();
      setPresentation(result.action.type === 'dismissPrompt'
        ? { type: 'dismissPrompt' }
        : { type: 'setSheet', sheet: 'collapsed' });
      return result.action;
    }
    if (result.action.type === 'delegateToHost') return result.action;
    if (!aliveRef.current || generationRef.current !== generation) return result.action;
    setBusy(true);
    try {
      if (result.action.type === 'dismissPendingConfirmation') {
        await cancelPending();
      } else {
        // Match the web rung ladder: one Back press walks exactly one camera
        // level (seat -> section -> venue). The next snapshot remains the
        // authority for whether another local rung is still available.
        await activeController.zoomOut();
      }
    } catch (nextError) {
      reportError(nextError);
    } finally {
      if (aliveRef.current && generationRef.current === generation) {
        coordinator.complete(result.action);
        setBusy(false);
      }
    }
    return result.action;
  }, [activeController, cancelPending, effectiveBackState, ownershipEpoch, pendingCancelCoordinator, reportError, sessionId]);

  const value = useMemo<SeatLayerPickerScopeValue>(
    () =>
      Object.freeze({
        controller: activeController,
        snapshot,
        configuration: activeConfiguration,
        bridgeConfig: activeBridgeConfig,
        themeMode,
        resolvedTheme,
        styles: suppliedStyles,
        pricing,
        formatMoney,
        strings,
        presentation: presentationForScope,
        error,
        isBusy: busy,
        isReady: ready,
        readOnly: activeReadOnly,
        availability: availabilityOf(activeController),
        sessionId,
        isSessionActive,
        pendingSeat: pendingConfirmation.pending,
        holdLapsed,
        holdLapse,
        isHoldLapseBusy: holdLapseBusy,
        setPresentation: setScopedPresentation,
        reportError,
        clearError,
        retry,
        markReady,
        subscribeChartLoad,
        confirmPending,
        cancelPending,
        dismissHoldLapse,
        reselectHoldLapse,
        setViewportInsetBand,
        removeViewportInsetBand,
        claimViewportInsetBand,
        claimPrompt,
        canHandleBack,
        back,
      }),
    [
      activeController,
      activeConfiguration,
      back,
      activeBridgeConfig,
      busy,
      cancelPending,
      confirmPending,
      clearError,
      dismissHoldLapse,
      error,
      formatMoney,
      holdLapsed,
      holdLapse,
      holdLapseBusy,
      isSessionActive,
      markReady,
      presentationForScope,
      pricing,
      pendingConfirmation.pending,
      activeReadOnly,
      ready,
      removeViewportInsetBand,
      claimViewportInsetBand,
      claimPrompt,
      canHandleBack,
      reportError,
      retry,
      reselectHoldLapse,
      resolvedTheme,
      suppliedStyles,
      sessionId,
      setViewportInsetBand,
      setScopedPresentation,
      subscribeChartLoad,
      snapshot,
      strings,
      themeMode,
    ],
  );
  return (
    <SeatLayerPickerScopeContext.Provider value={value}>
      {children}
    </SeatLayerPickerScopeContext.Provider>
  );
}

export function useSeatLayerPickerScope(): SeatLayerPickerScopeValue {
  return useSeatLayerPickerScopeContext();
}

/** Reads the one revision-ordered snapshot store used by the nearest scope. */
export function useSeatLayerPickerSnapshot(): SeatLayerPickerSnapshot | undefined {
  return useSeatLayerPickerScope().snapshot;
}

/** Scope state plus its latest immutable snapshot for composable chrome. */
export function useSeatLayerPicker(): SeatLayerPickerScopeValue {
  return useSeatLayerPickerScope();
}

/** Re-provides the exact scope value in a modal or render-prop tree. */
export function SeatLayerPickerScopeReprovider({
  children,
}: PropsWithChildren): React.ReactElement {
  const value = useSeatLayerPickerScope();
  return (
    <SeatLayerPickerScopeContext.Provider value={reprovideSeatLayerPickerScopeValue(value)}>
      {children}
    </SeatLayerPickerScopeContext.Provider>
  );
}
