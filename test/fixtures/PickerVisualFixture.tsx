import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CategoryTier, SelectedSeat } from '../../src/types';
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
  type SeatLayerPickerCheckoutHandoff,
  type SeatLayerPickerSnapshot,
  type SeatLayerSeatView,
} from '../../src/picker/models';

import { FixtureScopeProvider } from './FixtureScopeProvider';
import { NeutralMapSurface } from './NeutralMapSurface';

/** Fixed dimensions keep component rendering deterministic in automated tests. */
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
  'filters',
  'general-admission',
  'seat-tier',
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

const fixtureSeatTiers: readonly Readonly<CategoryTier>[] = Object.freeze([
  Object.freeze({ id: 'adult', name: 'Adult', price: 100, currency: 'EUR' }),
  Object.freeze({
    id: 'child',
    name: 'Child',
    price: 60,
    currency: 'EUR',
    restriction: 'child',
    buyerMessage: 'For children aged 12 and under.',
  }),
]);

const fixtureGoldCategory = Object.freeze({
  key: 'gold',
  label: 'Gold',
  color: '#B98600',
  priceMin: 60,
  priceMax: 100,
  available: 40,
  notForSale: false,
  tiers: fixtureSeatTiers,
});

const fixtureSilverCategory = Object.freeze({
  key: 'silver',
  label: 'Silver',
  color: '#7A8799',
  priceMin: 45,
  priceMax: 45,
  available: 64,
  notForSale: false,
  tiers: Object.freeze([]),
});

interface FixtureFilterState {
  readonly categoryKeys: readonly string[];
  readonly accessKeys: readonly string[];
  readonly limited: boolean;
  readonly colorblind: boolean;
  readonly trace: string;
}

interface FixtureFilterValidation {
  readonly state: FixtureFilterState;
  readonly setCategoryKeys: (keys: readonly string[]) => void;
  readonly setAccessKeys: (keys: readonly string[]) => void;
  readonly setLimited: (on: boolean) => void;
  readonly setColorblind: (on: boolean) => void;
}

interface FixtureImmersiveState {
  readonly buyerView: 'map' | 'venue3d';
  readonly targetSeatId?: string;
  readonly navigationMode: 'orbit' | 'pan';
  readonly seatView?: SeatLayerSeatView;
  readonly trace: string;
}

interface FixtureImmersiveValidation {
  readonly state: FixtureImmersiveState;
  readonly setBuyerView: (
    view: 'map' | 'venue3d',
    options?: Readonly<{ flyToSeatId?: string; resetView?: boolean }>,
  ) => void;
  readonly setNavigationMode: (mode: 'orbit' | 'pan') => void;
  readonly openSeatView: (seatId: string) => void;
  readonly closeSeatView: () => void;
  readonly recordCamera: (command: string) => void;
}

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

function fixtureTierSeat(tierId: 'adult' | 'child'): Readonly<SelectedSeat> {
  const tier = fixtureSeatTiers.find((candidate) => candidate.id === tierId) ?? fixtureSeatTiers[0]!;
  return Object.freeze({
    ...fixtureSeat(1, {
      categoryKey: fixtureGoldCategory.key,
      price: tier.price,
      rowLabel: 'G',
      sectionLabel: 'Main Stalls',
    }),
    tierId: tier.id,
    tiers: fixtureSeatTiers.map((tier) => ({ ...tier })),
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
    ...(seat.tierId === undefined ? {} : { tierId: seat.tierId }),
    seatId: seat.id,
    sectionLabel: seat.sectionLabel,
    rowLabel: seat.rowLabel,
    seatNumber: seat.seatNumber,
  });
}

function scenarioSeats(
  scenario: SeatLayerVisualFixtureScenario,
  tierId: 'adult' | 'child' = 'adult',
): readonly Readonly<SelectedSeat>[] {
  if (scenario === 'cart-dense') return denseFixtureSeats;
  if (scenario === 'seat-tier') return Object.freeze([fixtureTierSeat(tierId)]);
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

function fixtureSnapshot(
  scenario: SeatLayerVisualFixtureScenario,
  tierId: 'adult' | 'child' = 'adult',
  filters?: FixtureFilterState,
  immersive?: FixtureImmersiveState,
): SeatLayerPickerSnapshot {
  const selection = scenarioSeats(scenario, tierId);
  const cartLines = Object.freeze(selection.map(fixtureCartLine));
  const overview = scenario === 'overview' || scenario === 'best-seats' || scenario === 'loading' ||
    scenario === 'error' || scenario === 'empty' || scenario === 'general-admission';
  const floors = scenario === 'floors' || scenario === 'wide'
    ? fixtureFloors
    : Object.freeze([fixtureFloors[0]!]);
  const venue3D = scenario === 'venue-3d';
  const buyerView = venue3D ? immersive?.buyerView ?? 'venue3d' : 'map';
  const targetSeatId = venue3D
    ? immersive === undefined ? selection[1]?.id : immersive.targetSeatId
    : undefined;
  const targetIndex = targetSeatId === undefined
    ? -1
    : selection.findIndex((seat) => seat.id === targetSeatId);
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
    categories: scenario === 'filters'
      ? Object.freeze([fixtureGoldCategory, fixtureSilverCategory])
      : scenario === 'seat-tier'
      ? Object.freeze([fixtureGoldCategory])
      : scenario === 'empty'
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
      viewMode: buyerView === 'venue3d' ? '3d' : 'map',
      buyerView,
      view3DNavigationMode: immersive?.navigationMode ?? 'orbit',
      ...(venue3D ? {
        view3DFocusedSectionId: targetSeatId === undefined ? null : 'guest-tables',
      } : {}),
      ...(venue3D && targetSeatId !== undefined ? {
        view3DTargetSeatId: targetSeatId,
        view3DTargetSeat: selection[targetIndex],
        view3DPreviousSeatId: targetIndex > 0
          ? selection[targetIndex - 1]?.id
          : null,
        view3DNextSeatId: targetIndex >= 0 && targetIndex + 1 < selection.length
          ? selection[targetIndex + 1]?.id
          : null,
      } : {}),
      activeFloorId: floors[0]!.id,
      ...(overview ? {} : {
        focusedSectionId: 'guest-tables',
        focusedSection: Object.freeze({
          id: 'guest-tables',
          label: scenario === 'rtl' ? 'طاولات الضيوف' : 'Guest Tables',
        }),
      }),
      colorblindSafe: filters?.colorblind ?? false,
      hideLimitedView: filters?.limited ?? false,
      canZoomIn: true,
      canZoomOut: true,
      categoryFilter: Object.freeze(filters?.categoryKeys ?? []),
      accessibilityFilter: scenario === 'filters'
        ? Object.freeze(filters?.accessKeys ?? [])
        : scenario === 'accessibility'
        ? Object.freeze(['wheelchair'])
        : Object.freeze([]),
      ...(scenario === 'filters' ? {
        accessNeeds: Object.freeze([
          Object.freeze({ key: 'step-free', count: 12 }),
          Object.freeze({ key: 'wheelchair', count: 0 }),
          Object.freeze({ key: 'companion', count: 4 }),
        ]),
      } : scenario === 'accessibility' ? {
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
      ...(scenario === 'seat-tier' ? ['tiers'] : []),
      ...(scenario === 'general-admission' ? ['ga'] : []),
      ...(scenario === 'accessibility' || scenario === 'filters'
        ? ['accessibilityFilter', 'limitedViewFilter']
        : []),
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
  tierValidation?: Readonly<{
    tierId: 'adult' | 'child';
    setTierId: (tierId: 'adult' | 'child') => void;
    confirm: () => void;
    pending: boolean;
  }>,
  filterValidation?: FixtureFilterValidation,
  immersiveValidation?: FixtureImmersiveValidation,
): SeatLayerPickerScopeValue {
  const snapshot = fixtureSnapshot(
    scenario,
    tierValidation?.tierId,
    filterValidation?.state,
    immersiveValidation?.state,
  );
  const seatView = immersiveValidation?.state.seatView ?? fixtureSeatView(scenario);
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
    setCategoryFilter: async (keys: readonly string[]) => {
      filterValidation?.setCategoryKeys(keys);
    },
    setFloor: asyncNoOp,
    setAccessibilityFilter: async (keys: readonly string[]) => {
      filterValidation?.setAccessKeys(keys);
    },
    setLimitedViewFilter: async (on: boolean) => {
      filterValidation?.setLimited(on);
    },
    setColorblindSafe: async (on: boolean) => {
      filterValidation?.setColorblind(on);
    },
    setBuyerView: async (
      view: 'map' | 'venue3d',
      options?: Readonly<{ flyToSeatId?: string; resetView?: boolean }>,
    ) => {
      immersiveValidation?.setBuyerView(view, options);
    },
    setViewMode: async (view: 'map' | '3d') => {
      immersiveValidation?.setBuyerView(view === '3d' ? 'venue3d' : 'map');
    },
    setView3DNavigationMode: async (mode: 'orbit' | 'pan') => {
      immersiveValidation?.setNavigationMode(mode);
    },
    setVenue3DNavigationMode: async (mode: 'orbit' | 'pan') => {
      immersiveValidation?.setNavigationMode(mode);
    },
    openSeatView: async (seatId: string) => {
      immersiveValidation?.openSeatView(seatId);
    },
    zoomIn: async () => immersiveValidation?.recordCamera('picker.zoomIn'),
    zoomOut: async () => immersiveValidation?.recordCamera('picker.zoomOut'),
    zoomToFit: async () => immersiveValidation?.recordCamera('picker.zoomToFit'),
    overview: asyncNoOp,
    checkout: async () => ({ holdId: 'fixture-hold', expiresAt: seatLayerVisualFixtureClock, currency: 'EUR', lineItems: snapshot.cartLines, total: snapshot.cartTotal }),
    bestAvailable: asyncNoOp,
    holdGA: asyncNoOp,
    setSeatTier: async (_seatId: string, tierId: string | null) => {
      if (scenario === 'seat-tier' && (tierId === 'adult' || tierId === 'child')) tierValidation?.setTierId(tierId);
    },
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
  const pendingSeat = scenario === 'confirmation' || (scenario === 'seat-tier' && tierValidation?.pending)
    ? snapshot.selection[0] ?? null
    : null;
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
    confirmPending: scenario === 'seat-tier' ? tierValidation?.confirm ?? noOp : noOp,
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
  const selectedTierRef = useRef<'adult' | 'child'>('adult');
  const [tierPending, setTierPending] = useState(true);
  const [checkoutHandoff, setCheckoutHandoff] = useState<Readonly<SeatLayerPickerCheckoutHandoff>>();
  const [filterState, setFilterState] = useState<FixtureFilterState>(() => Object.freeze({
    categoryKeys: Object.freeze([]),
    accessKeys: Object.freeze([]),
    limited: false,
    colorblind: false,
    trace: 'Session filters-1 · no commands sent',
  }));
  const [immersiveState, setImmersiveState] = useState<FixtureImmersiveState>(() => Object.freeze({
    buyerView: 'venue3d',
    targetSeatId: 'guest-t22-2',
    navigationMode: 'orbit',
    trace: 'Session immersive-1 · target guest-t22-2',
  }));
  const setSelectedTier = useCallback((tierId: 'adult' | 'child') => {
    selectedTierRef.current = tierId;
  }, []);
  const confirmTier = useCallback(() => setTierPending(false), []);
  const tierValidation = useMemo(() => scenario === 'seat-tier' ? Object.freeze({
    tierId: selectedTierRef.current,
    setTierId: setSelectedTier,
    confirm: confirmTier,
    pending: tierPending,
  }) : undefined, [confirmTier, scenario, setSelectedTier, tierPending]);
  const setFilterCategoryKeys = useCallback((categoryKeys: readonly string[]) => {
    setFilterState((current) => Object.freeze({
      ...current,
      categoryKeys: Object.freeze([...categoryKeys]),
      trace: `Sent picker.setCategoryFilter · ${categoryKeys.join(', ') || 'all'}`,
    }));
  }, []);
  const setFilterAccessKeys = useCallback((accessKeys: readonly string[]) => {
    setFilterState((current) => Object.freeze({
      ...current,
      accessKeys: Object.freeze([...accessKeys]),
      trace: `Sent picker.setAccessibilityFilter · ${accessKeys.join(', ') || 'none'}`,
    }));
  }, []);
  const setFilterLimited = useCallback((limited: boolean) => {
    setFilterState((current) => Object.freeze({
      ...current,
      limited,
      trace: `Sent picker.setLimitedViewFilter · ${limited}`,
    }));
  }, []);
  const setFilterColorblind = useCallback((colorblind: boolean) => {
    setFilterState((current) => Object.freeze({
      ...current,
      colorblind,
      trace: `Sent picker.setColorblindSafe · ${colorblind}`,
    }));
  }, []);
  const filterValidation = useMemo<FixtureFilterValidation | undefined>(
    () => scenario === 'filters' ? Object.freeze({
      state: filterState,
      setCategoryKeys: setFilterCategoryKeys,
      setAccessKeys: setFilterAccessKeys,
      setLimited: setFilterLimited,
      setColorblind: setFilterColorblind,
    }) : undefined,
    [filterState, scenario, setFilterAccessKeys, setFilterCategoryKeys, setFilterColorblind, setFilterLimited],
  );
  const setImmersiveBuyerView = useCallback((
    buyerView: 'map' | 'venue3d',
    options?: Readonly<{ flyToSeatId?: string; resetView?: boolean }>,
  ) => {
    setImmersiveState((current) => {
      const targetSeatId = buyerView === 'map'
        ? undefined
        : options?.flyToSeatId ?? (options?.resetView ? undefined : current.targetSeatId);
      return Object.freeze({
        ...current,
        buyerView,
        targetSeatId,
        seatView: undefined,
        trace: `Sent picker.setBuyerView · ${buyerView} · ${targetSeatId ?? 'overview'}`,
      });
    });
  }, []);
  const setImmersiveNavigationMode = useCallback((navigationMode: 'orbit' | 'pan') => {
    setImmersiveState((current) => Object.freeze({
      ...current,
      navigationMode,
      trace: `Sent picker.setVenue3DNavigationMode · ${navigationMode}`,
    }));
  }, []);
  const openImmersiveSeatView = useCallback((seatId: string) => {
    const seatParts = seatId.split('-');
    const seatNumber = seatParts[seatParts.length - 1] ?? seatId;
    setImmersiveState((current) => Object.freeze({
      ...current,
      seatView: Object.freeze({
        seatId,
        title: `View from Guest Tables · T22-${seatNumber}`,
        caption: 'Real authored view · cart and 3D target retained',
        badge: 'Real 360°',
        dragHint: 'Drag to look around · pinch to zoom',
        real: true,
        generated: false,
      }),
      trace: `Opened panorama · ${seatId} · session immersive-1`,
    }));
  }, []);
  const closeImmersiveSeatView = useCallback(() => {
    setImmersiveState((current) => Object.freeze({
      ...current,
      seatView: undefined,
      trace: `Closed panorama · restored ${current.targetSeatId ?? 'overview'}`,
    }));
  }, []);
  const recordImmersiveCamera = useCallback((command: string) => {
    setImmersiveState((current) => Object.freeze({
      ...current,
      trace: `Sent ${command} · session immersive-1`,
    }));
  }, []);
  const immersiveValidation = useMemo<FixtureImmersiveValidation | undefined>(
    () => scenario === 'venue-3d' ? Object.freeze({
      state: immersiveState,
      setBuyerView: setImmersiveBuyerView,
      setNavigationMode: setImmersiveNavigationMode,
      openSeatView: openImmersiveSeatView,
      closeSeatView: closeImmersiveSeatView,
      recordCamera: recordImmersiveCamera,
    }) : undefined,
    [
      closeImmersiveSeatView,
      immersiveState,
      openImmersiveSeatView,
      recordImmersiveCamera,
      scenario,
      setImmersiveBuyerView,
      setImmersiveNavigationMode,
    ],
  );
  const baseScope = useMemo(
    () => fixtureScope(mode, scenario, tierValidation, filterValidation, immersiveValidation),
    [filterValidation, immersiveValidation, mode, scenario, tierValidation],
  );
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
    map: () => scenario === 'venue-3d' && immersiveValidation
      ? <FixtureImmersiveMapSurface
          onClosePanorama={immersiveValidation.closeSeatView}
          state={immersiveValidation.state}
          theme={scope.resolvedTheme}
        />
      : <NeutralMapSurface immersive={scenario === 'seat-view'} theme={scope.resolvedTheme} />,
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
  }), [immersiveValidation, scenario, scope.resolvedTheme]);
  const onCheckout = useCallback((handoff: SeatLayerPickerCheckoutHandoff) => {
    if (scenario === 'seat-tier') setCheckoutHandoff(handoff);
  }, [scenario]);
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
          onCheckout={onCheckout}
          options={{
            layout: wide ? 'wide' : 'phone',
            haptics: false,
            panelInitiallyCollapsed,
            enable3D: scenario !== 'filters',
          }}
          safeAreaInsets={wide ? seatLayerVisualFixtureWideSafeAreaInsets : seatLayerVisualFixtureSafeAreaInsets}
        />
        {scenario === 'filters' ? <FilterEvidence state={filterState} scope={scope} /> : null}
        {checkoutHandoff ? <TierCheckoutEvidence handoff={checkoutHandoff} scope={scope} /> : null}
      </View>
    </FixtureScopeProvider>
  );
}

function FilterEvidence({ state, scope }: Readonly<{
  state: FixtureFilterState;
  scope: SeatLayerPickerScopeValue;
}>): React.ReactElement {
  const categories = state.categoryKeys.length ? state.categoryKeys.join(', ') : 'all';
  const needs = state.accessKeys.length ? state.accessKeys.join(', ') : 'none';
  const label = `Filter state · categories ${categories} · needs ${needs} · limited ${state.limited} · colourblind ${state.colorblind}`;
  return <View
    accessible
    accessibilityLabel={label}
    pointerEvents="none"
    testID="seatlayer-filter-evidence"
    style={[styles.filterEvidence, {
      backgroundColor: scope.resolvedTheme.colors.surface,
      borderColor: scope.resolvedTheme.colors.divider,
    }]}
  >
    <Text style={[styles.filterEvidenceTitle, { color: scope.resolvedTheme.colors.text }]}>FILTER STATE</Text>
    <Text style={[styles.filterEvidenceText, { color: scope.resolvedTheme.colors.text }]}>{`Categories: ${categories}`}</Text>
    <Text style={[styles.filterEvidenceText, { color: scope.resolvedTheme.colors.text }]}>{`Needs: ${needs}`}</Text>
    <Text style={[styles.filterEvidenceText, { color: scope.resolvedTheme.colors.text }]}>{`Limited: ${state.limited} · Colourblind: ${state.colorblind}`}</Text>
    <Text style={[styles.filterEvidenceTrace, { color: scope.resolvedTheme.colors.mutedText }]}>{state.trace}</Text>
  </View>;
}

function FixtureImmersiveMapSurface({
  state,
  theme,
  onClosePanorama,
}: Readonly<{
  state: FixtureImmersiveState;
  theme: SeatLayerPickerScopeValue['resolvedTheme'];
  onClosePanorama: () => void;
}>): React.ReactElement {
  const target = state.targetSeatId ?? 'overview';
  return <View style={styles.immersiveFixtureRoot}>
    <NeutralMapSurface
      immersive={state.buyerView === 'venue3d' || state.seatView !== undefined}
      theme={theme}
    />
    {state.seatView ? <>
      <View pointerEvents="none" style={styles.panoramaStandIn}>
        <Text style={styles.panoramaGlyph}>↻</Text>
      </View>
      <Pressable
        accessibilityLabel="Close panorama"
        accessibilityRole="button"
        onPress={onClosePanorama}
        style={styles.panoramaClose}
      >
        <Text style={styles.panoramaCloseText}>×  Close panorama</Text>
      </Pressable>
    </> : <View
      accessible
      accessibilityLabel={`Immersive state · ${state.buyerView} · ${target} · ${state.navigationMode} · cart retained guest-t22-1, guest-t22-2, guest-t22-3`}
      pointerEvents="none"
      testID="seatlayer-immersive-evidence"
      style={[styles.immersiveEvidence, {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.divider,
      }]}
    >
      <Text style={[styles.immersiveEvidenceTitle, { color: theme.colors.text }]}>{`${state.buyerView === 'venue3d' ? '3D' : 'MAP'} · ${target} · ${state.navigationMode}`}</Text>
      <Text style={[styles.immersiveEvidenceText, { color: theme.colors.mutedText }]}>Cart retained · 3 seats · €285</Text>
      <Text style={[styles.immersiveEvidenceTrace, { color: theme.colors.mutedText }]}>{state.trace}</Text>
    </View>}
  </View>;
}

function TierCheckoutEvidence({ handoff, scope }: Readonly<{
  handoff: Readonly<SeatLayerPickerCheckoutHandoff>;
  scope: SeatLayerPickerScopeValue;
}>): React.ReactElement {
  const line = handoff.lineItems[0];
  const tier = line?.tierId === 'child' ? 'Child' : line?.tierId === 'adult' ? 'Adult' : 'Unknown tier';
  const amount = scope.formatMoney(line?.unitPrice ?? handoff.total, line?.currency ?? handoff.currency);
  const label = `Checkout handoff · Gold · ${tier} · ${amount}`;
  return <View
    accessible
    accessibilityLabel={label}
    testID="seatlayer-tier-checkout-handoff"
    style={[styles.tierCheckoutEvidence, { backgroundColor: scope.resolvedTheme.colors.background }]}
  >
    <Text style={[styles.tierCheckoutEyebrow, { color: scope.resolvedTheme.colors.accent, fontFamily: scope.resolvedTheme.fontFamily }]}>CHECKOUT HANDOFF</Text>
    <Text style={[styles.tierCheckoutTitle, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }]}>Gold · {tier}</Text>
    <Text style={[styles.tierCheckoutAmount, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }]}>{amount}</Text>
    <Text style={[styles.tierCheckoutMeta, { color: scope.resolvedTheme.colors.mutedText, fontFamily: scope.resolvedTheme.fontFamily }]}>Hold {handoff.holdId}</Text>
  </View>;
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
  tierCheckoutEvidence: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, paddingHorizontal: 24, position: 'absolute', right: 0, top: 0 },
  filterEvidence: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, left: 54, padding: 12, position: 'absolute', right: 54, top: 190 },
  filterEvidenceTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  filterEvidenceText: { fontSize: 13, marginTop: 3 },
  filterEvidenceTrace: { fontSize: 11, marginTop: 7 },
  immersiveFixtureRoot: { flex: 1 },
  immersiveEvidence: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, left: 20, padding: 12, position: 'absolute', right: 20, top: 70 },
  immersiveEvidenceTitle: { fontSize: 14, fontWeight: '900' },
  immersiveEvidenceText: { fontSize: 12, marginTop: 4 },
  immersiveEvidenceTrace: { fontSize: 11, marginTop: 6 },
  panoramaStandIn: { alignItems: 'center', backgroundColor: '#28394CCC', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  panoramaGlyph: { color: '#FFFFFF66', fontSize: 88, fontWeight: '200' },
  panoramaClose: { backgroundColor: '#E7C8FF', borderRadius: 22, left: 12, paddingHorizontal: 16, paddingVertical: 10, position: 'absolute', top: 12 },
  panoramaCloseText: { color: '#29143D', fontSize: 13, fontWeight: '800' },
  tierCheckoutEyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  tierCheckoutTitle: { fontSize: 24, fontWeight: '900', marginTop: 12 },
  tierCheckoutAmount: { fontSize: 42, fontWeight: '900', marginTop: 8 },
  tierCheckoutMeta: { fontSize: 14, marginTop: 12 },
});
