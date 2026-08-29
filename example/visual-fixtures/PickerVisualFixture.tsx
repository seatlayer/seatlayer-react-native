import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { SeatLayerPickerAdaptiveLayout } from '../../src/picker/SeatLayerPickerAdaptiveLayout';
import type { SeatLayerPickerController } from '../../src/picker/controller';
import type { SeatLayerPickerScopeValue } from '../../src/picker/SeatLayerPickerScope';
import { createSeatLayerPickerStringResolver } from '../../src/picker/locale';
import { seatLayerPickerInitialPresentationState } from '../../src/picker/presentationState';
import { resolveSeatLayerPickerTheme, type SeatLayerResolvedThemeMode } from '../../src/picker/theme';
import { seatLayerPickerSnapshotSchema, type SeatLayerPickerSnapshot } from '../../src/picker/models';

import { FixtureScopeProvider } from './FixtureScopeProvider';
import { NeutralMapSurface } from './NeutralMapSurface';

export const seatLayerVisualFixtureWidth = 390;
export const seatLayerVisualFixtureHeight = 844;
export const seatLayerVisualFixtureClock = 1_735_689_600_000;
export const seatLayerVisualFixtureSafeAreaInsets = Object.freeze({
  top: 47,
  right: 0,
  bottom: 34,
  left: 0,
});

export type SeatLayerVisualFixtureMode = 'light' | 'dark';

function fixtureSnapshot(): SeatLayerPickerSnapshot {
  return Object.freeze({
    schema: seatLayerPickerSnapshotSchema,
    sessionId: 'fixture-session', revision: 1,
    event: { key: 'visual-fixture', name: 'Seat picker preview', mode: 'test', currency: 'USD', venue: 'Venue', salesClosed: false },
    branding: { attributionRequired: false, brandName: 'SeatLayer' },
    categories: [{ key: 'standard', label: 'Standard', color: '#5B4B8A', priceMin: 48, priceMax: 48, available: 12, notForSale: false, tiers: [] }],
    zones: [{ id: 'main', label: 'Main room', color: '#5B4B8A' }],
    sections: [{ id: 'main', label: 'Main room', color: '#5B4B8A', dominantCategoryKey: 'standard', seatsLeft: 12, priceMin: 48, priceMax: 48 }],
    generalAdmissionAreas: [], bestAvailableZones: [],
    map: { rung: 'seats', viewMode: 'map', buyerView: 'map', view3DNavigationMode: 'orbit', activeFloorId: 'main', focusedSectionId: 'main', focusedSection: { id: 'main', label: 'Main room' }, colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true, categoryFilter: [], accessibilityFilter: [], floors: [{ id: 'main', name: 'Main floor', level: 0 }], floorMode: 'single' },
    selection: [{ id: 'fixture-seat', objectId: 'fixture-seat', objectType: 'seat', label: 'A 12', displayLabel: 'A 12', categoryKey: 'standard', price: 48, currency: 'USD', quantity: 1, sectionLabel: 'Main room', rowLabel: 'A', seatNumber: '12' }], maxSelection: 8, ticketCount: 1,
    cartLines: [{ lineKey: 'fixture-ticket', label: 'A 12', objectId: 'fixture-seat', objectType: 'seat', categoryKey: 'standard', unitPrice: 48, currency: 'USD', quantity: 1, sectionLabel: 'Main room', rowLabel: 'A', seatNumber: '12' }],
    cartTotal: 48, currency: 'USD', hold: { active: false, owner: 'picker' },
    accessConfigured: false, accessStatus: 'notRequired', capabilities: ['venue3d'], raw: Object.freeze({}),
  });
}

const noOp = () => undefined;
const asyncNoOp = async () => undefined;

function fixtureScope(mode: SeatLayerResolvedThemeMode): SeatLayerPickerScopeValue {
  const snapshot = fixtureSnapshot();
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
    getGACandidate: () => undefined,
    subscribeGACandidate: () => noOp,
    getSeatView: () => undefined,
    subscribeSeatView: () => noOp,
    setInteractionEnabled: asyncNoOp,
    setCategoryFilter: asyncNoOp,
    setFloor: asyncNoOp,
    setAccessibilityFilter: asyncNoOp,
    setLimitedViewFilter: asyncNoOp,
    setColorblindSafe: asyncNoOp,
    setBuyerView: asyncNoOp,
    setViewMode: asyncNoOp,
    zoomIn: asyncNoOp,
    zoomOut: asyncNoOp,
    zoomToFit: asyncNoOp,
    checkout: async () => ({ holdId: 'fixture-hold', expiresAt: seatLayerVisualFixtureClock, currency: 'USD', lineItems: snapshot.cartLines, total: snapshot.cartTotal }),
    bestAvailable: asyncNoOp,
    removeCartLine: asyncNoOp,
    undoRemoveCartLine: asyncNoOp,
  } as unknown as SeatLayerPickerController;
  const theme = resolveSeatLayerPickerTheme({ themeMode: mode });
  return Object.freeze({
    controller,
    snapshot,
    configuration: Object.freeze({ event: 'visual-fixture', currency: 'USD' }),
    bridgeConfig: Object.freeze({}), themeMode: mode, resolvedTheme: theme, styles: Object.freeze({}),
    strings: createSeatLayerPickerStringResolver({ locale: 'en' }),
    presentation: Object.freeze({ ...seatLayerPickerInitialPresentationState, sheet: 'expanded', focusedSection: { sectionId: 'main' }, isOverview: false, mapRung: 'seats' }),
    error: undefined, isBusy: false, isReady: true, readOnly: false,
    availability: Object.freeze({ floorStack: true, viewportInsets: true, venue3D: true, seatView: false, nativeSeatViewChrome: false }),
    sessionId: 1, pendingSeat: null, holdLapsed: false, holdLapse: undefined, isHoldLapseBusy: false,
    setPresentation: noOp, reportError: noOp, clearError: noOp, markReady: noOp, subscribeChartLoad: () => noOp,
    confirmPending: noOp, cancelPending: async () => false, dismissHoldLapse: noOp, reselectHoldLapse: async () => false,
    setViewportInsetBand: noOp, removeViewportInsetBand: noOp,
    claimViewportInsetBand: () => Object.freeze({ set: noOp, remove: noOp }),
    claimPrompt: () => undefined, canHandleBack: () => false, back: async () => ({ type: 'delegateToHost' } as const),
  });
}

/** A fixed-size native-chrome screen. It intentionally replaces only the map builder. */
export function SeatLayerPickerVisualFixture({
  mode,
}: Readonly<{
  mode: SeatLayerVisualFixtureMode;
}>): React.ReactElement {
  const scope = useMemo(() => fixtureScope(mode), [mode]);
  const builders = useMemo(() => Object.freeze({
    map: () => <NeutralMapSurface theme={scope.resolvedTheme} />,
  }), [scope.resolvedTheme]);
  return (
    <FixtureScopeProvider value={scope}>
      <View testID={`seatlayer-visual-fixture-${mode}`} style={[styles.frame, { backgroundColor: scope.resolvedTheme.colors.background }]}>
        <SeatLayerPickerAdaptiveLayout
          builders={builders}
          onCheckout={asyncNoOp}
          options={{ layout: 'phone', haptics: false, chrome: { systemBars: false } }}
          safeAreaInsets={seatLayerVisualFixtureSafeAreaInsets}
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
});
