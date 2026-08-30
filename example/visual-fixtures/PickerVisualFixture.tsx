import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SelectedSeat } from '../../src/types';
import { SeatLayerPickerAdaptiveLayout } from '../../src/picker/SeatLayerPickerAdaptiveLayout';
import { SeatLayerPickerHoldCountdown } from '../../src/picker/SeatLayerPickerHoldCountdown';
import {
  SeatLayerPickerColorblindButton,
  SeatLayerPickerOverviewButton,
  SeatLayerPickerViewModeControl,
  SeatLayerPickerZoomInButton,
  SeatLayerPickerZoomOutButton,
  SeatLayerPickerZoomToFitButton,
} from '../../src/picker/SeatLayerPickerMapButtons';
import type { SeatLayerPickerController } from '../../src/picker/controller';
import type { SeatLayerPickerScopeValue } from '../../src/picker/SeatLayerPickerScope';
import { createSeatLayerPickerStringResolver } from '../../src/picker/locale';
import {
  reduceSeatLayerPickerPresentationState,
  seatLayerPickerInitialPresentationState,
  type SeatLayerPickerLocalPresentationEvent,
  type SeatLayerPickerPresentationState,
  type SeatLayerPickerPromptKind,
} from '../../src/picker/presentationState';
import { SeatLayerPickerPromptOwnership } from '../../src/picker/promptOwnership';
import { resolveSeatLayerPickerTheme, type SeatLayerResolvedThemeMode } from '../../src/picker/theme';
import {
  seatLayerPickerSnapshotSchema,
  type SeatLayerPickerCartLine,
  type SeatLayerPickerSnapshot,
  type SeatLayerSeatView,
} from '../../src/picker/models';

import { FixtureScopeProvider } from './FixtureScopeProvider';
import { NeutralMapSurface } from './NeutralMapSurface';

export const seatLayerVisualFixtureWidth = 390;
export const seatLayerVisualFixtureHeight = 844;
export const seatLayerVisualFixtureWideWidth = 1024;
export const seatLayerVisualFixtureWideHeight = 1366;
export const seatLayerVisualFixtureClock = 1_735_689_600_000;
export const seatLayerVisualFixtureSafeAreaInsets = Object.freeze({
  top: 47,
  right: 0,
  bottom: 34,
  left: 0,
});
export const seatLayerVisualFixtureWideSafeAreaInsets = Object.freeze({
  top: 24,
  right: 0,
  bottom: 20,
  left: 0,
});

export const seatLayerVisualFixtureScenarios = Object.freeze([
  'overview',
  'section',
  'confirmation',
  'cart-peek',
  'cart-expanded',
  'cart-dense',
  'best-seats',
  'floors',
  'venue-3d',
  'seat-view',
  'loading',
  'error',
  'hold-countdown',
  'hold-lapse',
  'action-error',
  'empty',
  'long-copy',
  'custom-controls',
  'accessibility',
  'general-admission',
  'variable-table',
  'wide',
  'rtl',
] as const);

export type SeatLayerVisualFixtureMode = 'light' | 'dark';
export type SeatLayerVisualFixtureScenario = typeof seatLayerVisualFixtureScenarios[number];
export interface SeatLayerVisualFixtureSelection {
  readonly mode: SeatLayerVisualFixtureMode;
  readonly scenario: SeatLayerVisualFixtureScenario;
}

const noOp = () => undefined;
const asyncNoOp = async () => undefined;

const fixtureCategories = Object.freeze([
  Object.freeze({ key: 'premium', label: 'Premium', color: '#B98600', priceMin: 165, priceMax: 165, available: 20, notForSale: false, tiers: Object.freeze([]) }),
  Object.freeze({ key: 'sponsor', label: 'Sponsor tables', color: '#D97017', priceMin: 130, priceMax: 130, available: 36, notForSale: false, tiers: Object.freeze([]) }),
  Object.freeze({ key: 'guest', label: 'Guest tables', color: '#D45C87', priceMin: 95, priceMax: 95, available: 88, notForSale: false, tiers: Object.freeze([]) }),
  Object.freeze({ key: 'gallery', label: 'Gallery tables', color: '#9A6FD2', priceMin: 70, priceMax: 70, available: 72, notForSale: false, tiers: Object.freeze([]) }),
]);

const fixtureFloors = Object.freeze([
  Object.freeze({ id: 'ground', name: 'Ground floor', level: 0 }),
  Object.freeze({ id: 'balcony', name: 'Balcony', level: 1 }),
  Object.freeze({ id: 'gallery', name: 'Gallery', level: 2 }),
]);

const fixtureGAArea = Object.freeze({
  id: 'standing-floor',
  label: 'Floor standing',
  capacity: 120,
  available: 24,
  categoryKey: 'gallery',
  currency: 'EUR',
  price: 70,
  tiers: [
    Object.freeze({ id: 'adult', name: 'Adult', price: 70, currency: 'EUR' }),
    Object.freeze({
      id: 'companion',
      name: 'Companion',
      price: 0,
      currency: 'EUR',
      restriction: 'companion',
      buyerMessage: 'Available with an eligible accessibility ticket.',
    }),
  ],
});

const fixtureGACandidate = Object.freeze({
  areaId: fixtureGAArea.id,
  clickEpoch: 1,
});

function fixtureSeat(number: number, overrides: Readonly<{
  categoryKey?: string;
  price?: number;
  rowLabel?: string;
  sectionLabel?: string;
}> = {}): Readonly<SelectedSeat> {
  const categoryKey = overrides.categoryKey ?? 'guest';
  const price = overrides.price ?? 95;
  const rowLabel = overrides.rowLabel ?? 'T22';
  const sectionLabel = overrides.sectionLabel ?? 'Guest Tables';
  const id = `${categoryKey}-${rowLabel.toLocaleLowerCase()}-${number}`;
  return Object.freeze({
    id,
    objectId: id,
    objectType: 'seat',
    label: `${sectionLabel}-${rowLabel}-${number}`,
    displayLabel: `${sectionLabel} · Row ${rowLabel} · Seat ${number}`,
    categoryKey,
    price,
    currency: 'EUR',
    quantity: 1,
    sectionLabel,
    rowLabel,
    seatNumber: String(number),
  });
}

function fixtureVariableTable(): Readonly<SelectedSeat> {
  return Object.freeze({
    ...fixtureSeat(12),
    id: 'table-main-12',
    objectId: 'table-main-12',
    label: 'Main floor table 12',
    displayLabel: 'Main floor · Table 12',
    objectType: 'table',
    bookingMode: 'variable',
    quantity: 4,
    minOccupancy: 2,
    maxOccupancy: 8,
    capacity: 8,
    seatNumber: '12',
  });
}

const denseFixtureSeats = Object.freeze([
  fixtureSeat(1),
  fixtureSeat(2),
  fixtureSeat(3),
  fixtureSeat(4, { rowLabel: 'T23' }),
  fixtureSeat(5, { categoryKey: 'gallery', price: 70, rowLabel: 'G1', sectionLabel: 'Gallery Tables' }),
  fixtureSeat(6, { categoryKey: 'gallery', price: 70, rowLabel: 'G2', sectionLabel: 'Gallery Tables' }),
  fixtureSeat(7, { categoryKey: 'premium', price: 165, rowLabel: 'T24' }),
  fixtureSeat(8, { categoryKey: 'sponsor', price: 130, rowLabel: 'T25' }),
]);

function fixtureCartLine(seat: Readonly<SelectedSeat>): Readonly<SeatLayerPickerCartLine> {
  return Object.freeze({
    lineKey: `line-${seat.id}`,
    label: seat.label,
    displayLabel: seat.displayLabel,
    objectId: seat.objectId ?? seat.id,
    objectType: seat.objectType ?? 'seat',
    categoryKey: seat.categoryKey ?? 'guest',
    unitPrice: seat.price ?? 95,
    currency: seat.currency ?? 'EUR',
    quantity: seat.quantity ?? 1,
    seatId: seat.id,
    sectionLabel: seat.sectionLabel,
    rowLabel: seat.rowLabel,
    seatNumber: seat.seatNumber,
  });
}

function scenarioSeats(scenario: SeatLayerVisualFixtureScenario): readonly Readonly<SelectedSeat>[] {
  if (scenario === 'cart-dense') return denseFixtureSeats;
  if (scenario === 'variable-table') return Object.freeze([fixtureVariableTable()]);
  if (scenario === 'wide') return Object.freeze([
    fixtureSeat(1),
    fixtureSeat(2),
    fixtureSeat(3, { categoryKey: 'premium', price: 165, rowLabel: 'T24' }),
    fixtureSeat(4, { categoryKey: 'gallery', price: 70, rowLabel: 'G1', sectionLabel: 'Gallery Tables' }),
  ]);
  if (scenario === 'venue-3d') {
    return Object.freeze([fixtureSeat(1), fixtureSeat(2), fixtureSeat(3)]);
  }
  if (scenario === 'confirmation' || scenario === 'cart-peek' || scenario === 'cart-expanded' || scenario === 'seat-view') {
    return Object.freeze([fixtureSeat(1)]);
  }
  return Object.freeze([]);
}

function fixtureSnapshot(scenario: SeatLayerVisualFixtureScenario): SeatLayerPickerSnapshot {
  const selection = scenarioSeats(scenario);
  const cartLines = Object.freeze(selection.map(fixtureCartLine));
  const overview = scenario === 'overview' || scenario === 'best-seats' || scenario === 'loading' ||
    scenario === 'error' || scenario === 'empty' || scenario === 'general-admission';
  const floors = scenario === 'floors' || scenario === 'wide'
    ? fixtureFloors
    : Object.freeze([fixtureFloors[0]!]);
  const venue3D = scenario === 'venue-3d';
  return Object.freeze({
    schema: seatLayerPickerSnapshotSchema,
    sessionId: `fixture-${scenario}`,
    revision: 1,
    event: Object.freeze({
      key: 'visual-fixture',
      name: scenario === 'long-copy'
        ? 'A very long authored event title that must remain calm and readable'
        : scenario === 'rtl'
          ? 'أمسية الموسيقى في المسرح الكبير'
        : '27 aug event seatlayer',
      mode: 'test',
      currency: 'EUR',
      venue: scenario === 'long-copy'
        ? 'The exceptionally long international venue name'
        : scenario === 'rtl'
          ? 'المسرح الكبير'
        : 'SeatLayer venue',
      salesClosed: false,
    }),
    branding: Object.freeze({
      attributionRequired: true,
      brandName: 'SeatLayer',
      accent: '#EF4056',
      accentInk: '#111827',
    }),
    categories: scenario === 'empty'
      ? Object.freeze(fixtureCategories.map((category) => Object.freeze({ ...category, available: 0 })))
      : fixtureCategories,
    zones: Object.freeze([
      Object.freeze({ id: 'main', label: 'Main room', color: '#D45C87' }),
      Object.freeze({ id: 'gallery', label: 'Gallery', color: '#9A6FD2' }),
    ]),
    sections: Object.freeze([
      Object.freeze({
        id: 'guest-tables',
        label: scenario === 'rtl' ? 'طاولات الضيوف' : 'Guest Tables',
        color: '#D45C87', dominantCategoryKey: 'guest', zoneId: 'main',
        zoneLabel: scenario === 'rtl' ? 'القاعة الرئيسية' : 'Main room',
        seatsLeft: 88, priceMin: 95, priceMax: 95,
      }),
      Object.freeze({ id: 'gallery-tables', label: 'Gallery Tables', color: '#9A6FD2', dominantCategoryKey: 'gallery', zoneId: 'gallery', zoneLabel: 'Gallery', seatsLeft: 72, priceMin: 70, priceMax: 70 }),
    ]),
    generalAdmissionAreas: scenario === 'general-admission'
      ? Object.freeze([fixtureGAArea])
      : Object.freeze([]),
    bestAvailableZones: Object.freeze([
      Object.freeze({ id: 'main', label: 'Main room', color: '#D45C87' }),
      Object.freeze({ id: 'gallery', label: 'Gallery', color: '#9A6FD2' }),
    ]),
    map: Object.freeze({
      rung: overview ? 'overview' : 'seats',
      viewMode: venue3D ? '3d' : 'map',
      buyerView: venue3D ? 'venue3d' : 'map',
      view3DNavigationMode: 'orbit',
      ...(venue3D ? { view3DTargetSeatId: selection[1]?.id } : {}),
      activeFloorId: floors[0]!.id,
      ...(overview ? {} : {
        focusedSectionId: 'guest-tables',
        focusedSection: Object.freeze({
          id: 'guest-tables',
          label: scenario === 'rtl' ? 'طاولات الضيوف' : 'Guest Tables',
        }),
      }),
      colorblindSafe: false,
      hideLimitedView: false,
      canZoomIn: true,
      canZoomOut: true,
      categoryFilter: Object.freeze([]),
      accessibilityFilter: scenario === 'accessibility'
        ? Object.freeze(['wheelchair'])
        : Object.freeze([]),
      ...(scenario === 'accessibility' ? {
        accessNeeds: Object.freeze([
          Object.freeze({ key: 'wheelchair', count: 14 }),
          Object.freeze({ key: 'companion', count: 8 }),
          Object.freeze({ key: 'step-free', count: 24 }),
          Object.freeze({ key: 'hearing', count: 6 }),
        ]),
      } : {}),
      floors,
      floorMode: scenario === 'floors' ? 'all' : 'single',
    }),
    selection,
    maxSelection: 8,
    ticketCount: selection.length,
    cartLines,
    cartTotal: cartLines.reduce((total, line) => total + line.unitPrice * line.quantity, 0),
    currency: 'EUR',
    hold: scenario === 'hold-countdown'
      ? Object.freeze({ active: true, owner: 'picker', expiresAt: seatLayerVisualFixtureClock + 272_000 })
      : Object.freeze({ active: false, owner: 'picker' }),
    accessConfigured: false,
    accessStatus: 'notRequired',
    capabilities: Object.freeze([
      'venue3d',
      'seatView',
      ...(scenario === 'general-admission' ? ['ga'] : []),
      ...(scenario === 'accessibility' ? ['accessibilityFilter', 'limitedViewFilter'] : []),
    ]),
    raw: Object.freeze({}),
  });
}

function fixtureSeatView(scenario: SeatLayerVisualFixtureScenario): SeatLayerSeatView | undefined {
  if (scenario !== 'seat-view') return undefined;
  return Object.freeze({
    seatId: 'guest-t22-1',
    title: 'Guest Tables · T22 · Seat 1',
    caption: 'View towards the stage',
    badge: 'Real view',
    dragHint: 'Drag to look around',
    real: true,
    generated: false,
  });
}

function fixtureScope(
  mode: SeatLayerResolvedThemeMode,
  scenario: SeatLayerVisualFixtureScenario,
): SeatLayerPickerScopeValue {
  const snapshot = fixtureSnapshot(scenario);
  const seatView = fixtureSeatView(scenario);
  const gaCandidate = scenario === 'general-admission' ? fixtureGACandidate : undefined;
  const mapController = {
    isReady: true,
    supportsPickerCapability: () => true,
    supportsPickerCommand: () => true,
    supportsPickerEvent: () => true,
    on: () => noOp,
  };
  const controller = {
    mapController,
    getSnapshot: () => snapshot,
    subscribe: () => noOp,
    getGACandidate: () => gaCandidate,
    subscribeGACandidate: () => noOp,
    clearGACandidate: noOp,
    getSeatView: () => seatView,
    subscribeSeatView: () => noOp,
    supportsFloorStack: true,
    supportsViewportInsets: true,
    supportsVenue3D: true,
    supportsSeatView: true,
    supportsNativeSeatViewChrome: true,
    setInteractionEnabled: asyncNoOp,
    setCategoryFilter: asyncNoOp,
    setFloor: asyncNoOp,
    setAccessibilityFilter: asyncNoOp,
    setLimitedViewFilter: asyncNoOp,
    setColorblindSafe: asyncNoOp,
    setBuyerView: asyncNoOp,
    setViewMode: asyncNoOp,
    setView3DNavigationMode: asyncNoOp,
    setVenue3DNavigationMode: asyncNoOp,
    zoomIn: asyncNoOp,
    zoomOut: asyncNoOp,
    zoomToFit: asyncNoOp,
    overview: asyncNoOp,
    checkout: async () => ({ holdId: 'fixture-hold', expiresAt: seatLayerVisualFixtureClock, currency: 'EUR', lineItems: snapshot.cartLines, total: snapshot.cartTotal }),
    bestAvailable: asyncNoOp,
    holdGA: asyncNoOp,
    setTableQuantity: asyncNoOp,
    removeCartLine: asyncNoOp,
    undoRemoveCartLine: asyncNoOp,
    selectObjects: asyncNoOp,
  } as unknown as SeatLayerPickerController;
  const theme = resolveSeatLayerPickerTheme({
    themeMode: mode,
    organizerBranding: snapshot.branding,
  });
  const expanded = scenario === 'cart-expanded' || scenario === 'cart-dense' || scenario === 'best-seats' ||
    scenario === 'hold-lapse' || scenario === 'action-error';
  const overview = snapshot.map.rung !== 'seats';
  const ready = scenario !== 'loading' && scenario !== 'error';
  const pendingSeat = scenario === 'confirmation' ? snapshot.selection[0] ?? null : null;
  return Object.freeze({
    controller,
    snapshot,
    configuration: Object.freeze({ event: 'visual-fixture', currency: 'EUR' }),
    bridgeConfig: Object.freeze({}),
    themeMode: mode,
    resolvedTheme: theme,
    styles: Object.freeze({}),
    pricing: undefined,
    formatMoney: (amount: number, currency: string) => `${currency === 'EUR' ? '€' : `${currency} `}${amount}`,
    strings: createSeatLayerPickerStringResolver({
      locale: scenario === 'rtl' ? 'ar' : 'en',
      ...(scenario === 'long-copy' ? { overrides: {
        accessibility: 'Accessibility, colour and visibility preferences',
        fitVenue: 'Fit the complete venue to the available screen',
        holdAndCheckout: 'Hold these selected places and continue securely',
      } } : {}),
    }),
    presentation: Object.freeze({
      ...seatLayerPickerInitialPresentationState,
      sheet: expanded ? 'expanded' : 'collapsed',
      focusedSection: overview ? null : Object.freeze({ sectionId: 'guest-tables' }),
      isOverview: overview,
      mapRung: snapshot.map.rung,
    }),
    error: scenario === 'error' || scenario === 'action-error'
      ? Object.freeze({ buyerMessage: scenario === 'action-error'
        ? 'That seat changed before the selection could be completed.'
        : 'Seats could not be loaded.' })
      : undefined,
    isBusy: false,
    isReady: ready,
    readOnly: false,
    availability: Object.freeze({ floorStack: true, viewportInsets: true, venue3D: true, seatView: true, nativeSeatViewChrome: true }),
    sessionId: 1,
    isSessionActive: () => true,
    pendingSeat: scenario === 'variable-table' ? snapshot.selection[0] ?? null : pendingSeat,
    holdLapsed: scenario === 'hold-lapse',
    holdLapse: scenario === 'hold-lapse' ? Object.freeze({
      key: 'fixture-hold-lapse',
      heldForMs: 300_000,
      lapsedLabels: Object.freeze(['Guest Tables-T22-1', 'Guest Tables-T22-2']),
      recoverableLabels: Object.freeze(['Guest Tables-T22-1']),
      revision: 1,
    }) : undefined,
    isHoldLapseBusy: false,
    setPresentation: noOp,
    reportError: noOp,
    clearError: noOp,
    retry: asyncNoOp,
    markReady: noOp,
    subscribeChartLoad: () => noOp,
    confirmPending: noOp,
    cancelPending: async () => false,
    dismissHoldLapse: noOp,
    reselectHoldLapse: async () => false,
    setViewportInsetBand: noOp,
    removeViewportInsetBand: noOp,
    claimViewportInsetBand: () => Object.freeze({ set: noOp, remove: noOp }),
    claimPrompt: () => undefined,
    canHandleBack: () => false,
    back: async () => ({ type: 'delegateToHost' } as const),
  });
}

export function parseSeatLayerVisualFixture(
  value: string | undefined,
): SeatLayerVisualFixtureSelection | undefined {
  if (value === 'light' || value === 'dark') {
    return Object.freeze({ mode: value, scenario: 'cart-expanded' });
  }
  const [mode, scenario, extra] = value?.split(':') ?? [];
  if (extra !== undefined || (mode !== 'light' && mode !== 'dark') ||
    !seatLayerVisualFixtureScenarios.includes(scenario as SeatLayerVisualFixtureScenario)) return undefined;
  return Object.freeze({ mode, scenario: scenario as SeatLayerVisualFixtureScenario });
}

/** A fixed-size native-chrome screen. It intentionally replaces only the map builder. */
export function SeatLayerPickerVisualFixture({
  mode,
  scenario = 'cart-expanded',
}: Readonly<{
  mode: SeatLayerVisualFixtureMode;
  scenario?: SeatLayerVisualFixtureScenario;
}>): React.ReactElement {
  return <SeatLayerPickerVisualFixtureSession key={`${mode}:${scenario}`} mode={mode} scenario={scenario} />;
}

function SeatLayerPickerVisualFixtureSession({
  mode,
  scenario,
}: Readonly<{
  mode: SeatLayerVisualFixtureMode;
  scenario: SeatLayerVisualFixtureScenario;
}>): React.ReactElement {
  const baseScope = useMemo(() => fixtureScope(mode, scenario), [mode, scenario]);
  const [presentation, setPresentationState] = useState<SeatLayerPickerPresentationState>(baseScope.presentation);
  const promptOwnership = useRef(new SeatLayerPickerPromptOwnership());
  useEffect(() => () => promptOwnership.current.reset(), []);
  const setPresentation = useCallback((event: SeatLayerPickerLocalPresentationEvent) => {
    setPresentationState((current) => reduceSeatLayerPickerPresentationState(current, event));
  }, []);
  const claimPrompt = useCallback((owner: string, kind: SeatLayerPickerPromptKind, context?: unknown) => {
    const lease = promptOwnership.current.claim(owner, kind, context);
    if (!lease) return undefined;
    return Object.freeze({
      lease,
      open: () => {
        if (!promptOwnership.current.isActive(lease)) return false;
        setPresentationState((current) => reduceSeatLayerPickerPresentationState(current, {
          type: 'openPrompt',
          prompt: promptOwnership.current.asPresentation(lease),
        }));
        return true;
      },
      dismiss: () => {
        if (!promptOwnership.current.dismiss(lease)) return false;
        setPresentationState((current) => reduceSeatLayerPickerPresentationState(current, { type: 'dismissPrompt' }));
        return true;
      },
    });
  }, []);
  const back = useCallback(async () => {
    const active = promptOwnership.current.current;
    if (!active || !promptOwnership.current.dismiss(active)) return { type: 'delegateToHost' } as const;
    setPresentationState((current) => reduceSeatLayerPickerPresentationState(current, { type: 'dismissPrompt' }));
    return { type: 'dismissPrompt' } as const;
  }, []);
  const scope = useMemo<SeatLayerPickerScopeValue>(() => Object.freeze({
    ...baseScope,
    presentation,
    setPresentation,
    claimPrompt,
    canHandleBack: () => promptOwnership.current.current !== undefined,
    back,
  }), [back, baseScope, claimPrompt, presentation, setPresentation]);
  const builders = useMemo(() => Object.freeze({
    map: () => <NeutralMapSurface immersive={scenario === 'venue-3d' || scenario === 'seat-view'} theme={scope.resolvedTheme} />,
    ...(scenario === 'hold-countdown' ? {
      holdCountdown: () => <SeatLayerPickerHoldCountdown clock={() => seatLayerVisualFixtureClock} />,
    } : {}),
    ...(scenario === 'custom-controls' ? {
      mapControls: () => <View pointerEvents="box-none" style={styles.customControlsOwner}>
        <View style={styles.customControlsTop}>
          <SeatLayerPickerOverviewButton />
          <SeatLayerPickerViewModeControl />
        </View>
        <View style={styles.customControlsBottom}>
          <SeatLayerPickerColorblindButton />
          <SeatLayerPickerZoomInButton />
          <SeatLayerPickerZoomOutButton />
          <SeatLayerPickerZoomToFitButton />
        </View>
      </View>,
    } : {}),
  }), [scenario, scope.resolvedTheme]);
  const wide = scenario === 'wide';
  const panelInitiallyCollapsed = baseScope.presentation.sheet !== 'expanded';
  return (
    <FixtureScopeProvider value={scope}>
      <View
        testID={`seatlayer-visual-fixture-${mode}-${scenario}`}
        style={[wide ? styles.wideFrame : styles.frame, { backgroundColor: scope.resolvedTheme.colors.background }]}
      >
        <SeatLayerPickerAdaptiveLayout
          builders={builders}
          onCheckout={asyncNoOp}
          options={{ layout: wide ? 'wide' : 'phone', haptics: false, panelInitiallyCollapsed }}
          safeAreaInsets={wide ? seatLayerVisualFixtureWideSafeAreaInsets : seatLayerVisualFixtureSafeAreaInsets}
        />
      </View>
    </FixtureScopeProvider>
  );
}

export function SeatLayerPickerLightVisualFixture(): React.ReactElement {
  return <SeatLayerPickerVisualFixture mode="light" />;
}

export function SeatLayerPickerDarkVisualFixture(): React.ReactElement {
  return <SeatLayerPickerVisualFixture mode="dark" />;
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'center', height: seatLayerVisualFixtureHeight, overflow: 'hidden', width: seatLayerVisualFixtureWidth },
  wideFrame: { alignSelf: 'center', height: seatLayerVisualFixtureWideHeight, overflow: 'hidden', width: seatLayerVisualFixtureWideWidth },
  customControlsOwner: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  customControlsTop: { alignItems: 'flex-end', gap: 6, position: 'absolute', right: 10, top: 10 },
  customControlsBottom: { bottom: 10, gap: 6, position: 'absolute', right: 10 },
});
