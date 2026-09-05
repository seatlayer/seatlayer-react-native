import React, { useMemo, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { focusedPickerSection, usePickerSingleFlight } from './pickerNavigation';
import {
  SeatLayerMapControlButtonView,
  SeatLayerPickerBackIcon,
  SeatLayerPickerFocusCornersIcon,
  SeatLayerPickerMinusIcon,
  SeatLayerPickerPlusIcon,
  SeatLayerPickerViewModeControlView,
} from './SeatLayerMapControls';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerStyles, type SeatLayerPickerStyles } from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';

/**
 * Host-composed map chrome. The host owns placement, so it also owns the §2.4
 * blocked region: wrap these in `SeatLayerPickerBlockedRegionView` where they
 * stand over the map. The SDK's own `SeatLayerMapControls` registers its own.
 */
type StandaloneSlots = Pick<SeatLayerPickerStyles,
  'mapControlButton' | 'mapControlLabel' | 'mapControlsContainer'>;

export interface SeatLayerPickerMapControlButtonProps {
  readonly label?: string;
  readonly slots?: StandaloneSlots;
  readonly style?: StyleProp<ViewStyle>;
}

export interface SeatLayerPickerViewModeControlProps extends Omit<SeatLayerPickerMapControlButtonProps, 'label'> {
  readonly onLayout?: (width: number) => void;
}

type MapAction = 'overview' | 'zoomIn' | 'zoomOut' | 'fit' | 'toggleView' | 'navigation' | 'colorblind';

function supports(
  scope: SeatLayerPickerScopeValue,
  capability: string | undefined,
  command: string,
): boolean {
  return supportsSeatLayerPickerSurface(
    scope.controller,
    ['native-chrome-contract-v1', ...(capability ? [capability] : [])],
    [command],
  );
}

function actionAvailable(scope: SeatLayerPickerScopeValue, action: MapAction): boolean {
  const snapshot = scope.snapshot;
  if (!snapshot) return false;
  const map = snapshot.map;
  if (action === 'overview') {
    return map.buyerView === 'map' && focusedPickerSection(snapshot) !== undefined &&
      supports(scope, undefined, 'picker.overview');
  }
  if (action === 'zoomIn') return map.buyerView === 'map' && supports(scope, 'zoom', 'picker.zoomIn');
  if (action === 'zoomOut') return map.buyerView === 'map' && supports(scope, 'zoom', 'picker.zoomOut');
  if (action === 'fit') return map.buyerView === 'map' && supports(scope, 'zoom', 'picker.zoomToFit');
  if (action === 'toggleView') {
    return (map.buyerView === 'map' || map.buyerView === 'venue3d') &&
      snapshot.capabilities.includes('venue3d') && supports(scope, 'venue-3d-v1', 'picker.setBuyerView');
  }
  if (action === 'navigation') {
    return map.buyerView === 'venue3d' && snapshot.capabilities.includes('venue3d') &&
      supports(scope, 'venue-3d-controls-v1', 'picker.setVenue3DNavigationMode');
  }
  return map.buyerView === 'map' && supports(scope, 'colorblind-safe', 'picker.setColorblindSafe');
}

async function dispatchMapAction(scope: SeatLayerPickerScopeValue, action: MapAction): Promise<void> {
  const controller = scope.controller;
  const live = controller.getSnapshot();
  const current = { ...scope, snapshot: live } as SeatLayerPickerScopeValue;
  if (controller !== scope.controller || !actionAvailable(current, action) || !live) return;
  if (action === 'overview') await controller.overview();
  else if (action === 'zoomIn' && live.map.canZoomIn) await controller.zoomIn();
  else if (action === 'zoomOut' && live.map.canZoomOut) await controller.zoomOut();
  else if (action === 'fit') await controller.zoomToFit();
  else if (action === 'toggleView') {
    await controller.setBuyerView(live.map.buyerView === 'venue3d' ? 'map' : 'venue3d');
  } else if (action === 'navigation') {
    await controller.setVenue3DNavigationMode(live.map.view3DNavigationMode === 'pan' ? 'orbit' : 'pan');
  } else if (action === 'colorblind') {
    await controller.setColorblindSafe(!live.map.colorblindSafe);
  }
}

function actionLabel(scope: SeatLayerPickerScopeValue, action: MapAction, override?: string): string {
  if (typeof override === 'string' && override.trim()) return override.trim();
  const snapshot = scope.snapshot;
  if (action === 'overview') return scope.strings.translate('backToVenue');
  if (action === 'zoomIn') return scope.strings.translate('zoomIn');
  if (action === 'zoomOut') return scope.strings.translate('zoomOut');
  if (action === 'fit') return scope.strings.translate('fitVenue');
  if (action === 'colorblind') return scope.strings.translate('colorblindSafe');
  if (action === 'navigation') {
    return scope.strings.translate(snapshot?.map.view3DNavigationMode === 'pan' ? 'moveVenue' : 'rotateVenue');
  }
  return scope.strings.translate(snapshot?.map.buyerView === 'venue3d' ? 'mapView' : 'venue3D');
}

function actionIcon(scope: SeatLayerPickerScopeValue, action: MapAction, color: string): ReactNode {
  if (action === 'overview') return <SeatLayerPickerBackIcon color={color} />;
  if (action === 'zoomIn') return <SeatLayerPickerPlusIcon color={color} />;
  if (action === 'zoomOut') return <SeatLayerPickerMinusIcon color={color} />;
  if (action === 'fit') return <SeatLayerPickerFocusCornersIcon color={color} />;
  if (action === 'colorblind') return <EyeIcon color={color} />;
  if (action === 'navigation') {
    return scope.snapshot?.map.view3DNavigationMode === 'pan'
      ? <MoveIcon color={color} /> : <OrbitIcon color={color} />;
  }
  return scope.snapshot?.map.buyerView === 'venue3d'
    ? <MapIcon color={color} /> : <CubeIcon color={color} />;
}

function StandaloneButton({
  action,
  label,
  slots: componentSlots,
  style,
}: SeatLayerPickerMapControlButtonProps & { readonly action: MapAction }): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const request = useRef<Readonly<{
    controller: SeatLayerPickerScopeValue['controller'];
    sessionId: number;
  }> | undefined>(undefined);
  const [busy, run] = usePickerSingleFlight(
    scope.sessionId,
    scope.reportError,
    () => {
      const active = request.current;
      if (!active || active.controller !== scope.controller || active.sessionId !== scope.sessionId) return undefined;
      return dispatchMapAction(scope, action);
    },
  );
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, componentSlots),
    [componentSlots, scope.styles],
  );
  if (!actionAvailable(scope, action)) return null;
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const stateDisabled = action === 'zoomIn' && scope.snapshot?.map.canZoomIn === false ||
    action === 'zoomOut' && scope.snapshot?.map.canZoomOut === false;
  const active = action === 'colorblind' && scope.snapshot?.map.colorblindSafe === true ||
    action === 'toggleView' && scope.snapshot?.map.buyerView === 'venue3d' ||
    action === 'navigation';
  return <SeatLayerMapControlButtonView
    active={active}
    enabled={!scope.isBusy && !busy && !stateDisabled}
    label={actionLabel(scope, action, label)}
    onPress={() => {
      request.current = Object.freeze({ controller: scope.controller, sessionId: scope.sessionId });
      run();
    }}
    slots={styles}
    style={style}
    selected={action === 'colorblind' || action === 'toggleView' ? active : undefined}
    target={scope.resolvedTheme.layout.minimumHitTarget}
    theme={theme}
  >{actionIcon(scope, action, theme.colors.text)}</SeatLayerMapControlButtonView>;
}

/** Map / real venue-3D segmented control for custom compositions. */
export function SeatLayerPickerViewModeControl(
  props: SeatLayerPickerViewModeControlProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const requested = useRef<Readonly<{
    controller: SeatLayerPickerScopeValue['controller'];
    sessionId: number;
    view: 'map' | 'venue3d';
  }> | undefined>(undefined);
  const [busy, run] = usePickerSingleFlight(scope.sessionId, scope.reportError, async () => {
    const request = requested.current;
    if (!request || request.controller !== scope.controller || request.sessionId !== scope.sessionId) return;
    const controller = scope.controller;
    const live = controller.getSnapshot();
    const current = { ...scope, snapshot: live } as SeatLayerPickerScopeValue;
    if (!live || !actionAvailable(current, 'toggleView') || live.map.buyerView === request.view) return;
    await controller.setBuyerView(request.view);
  });
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  if (!actionAvailable(scope, 'toggleView')) return null;
  return <SeatLayerPickerViewModeControlView
    buyerView={scope.snapshot?.map.buyerView === 'venue3d' ? 'venue3d' : 'map'}
    disabled={scope.isBusy || busy}
    onLayout={props.onLayout}
    onPress={(view) => {
      requested.current = Object.freeze({ controller: scope.controller, sessionId: scope.sessionId, view });
      run();
    }}
    slots={styles}
    strings={scope.strings}
    style={props.style}
    target={scope.resolvedTheme.layout.minimumHitTarget}
    theme={resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot)}
  />;
}

export function SeatLayerPickerOverviewButton(props: SeatLayerPickerMapControlButtonProps): React.ReactElement | null {
  return <StandaloneButton {...props} action="overview" />;
}
export function SeatLayerPickerZoomInButton(props: SeatLayerPickerMapControlButtonProps): React.ReactElement | null {
  return <StandaloneButton {...props} action="zoomIn" />;
}
export function SeatLayerPickerZoomOutButton(props: SeatLayerPickerMapControlButtonProps): React.ReactElement | null {
  return <StandaloneButton {...props} action="zoomOut" />;
}
export function SeatLayerPickerZoomToFitButton(props: SeatLayerPickerMapControlButtonProps): React.ReactElement | null {
  return <StandaloneButton {...props} action="fit" />;
}
export function SeatLayerPickerViewModeButton(props: SeatLayerPickerMapControlButtonProps): React.ReactElement | null {
  return <StandaloneButton {...props} action="toggleView" />;
}
export function SeatLayerPicker3DNavigationModeButton(props: SeatLayerPickerMapControlButtonProps): React.ReactElement | null {
  return <StandaloneButton {...props} action="navigation" />;
}
export function SeatLayerPickerColorblindButton(props: SeatLayerPickerMapControlButtonProps): React.ReactElement | null {
  return <StandaloneButton {...props} action="colorblind" />;
}

function CubeIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={{ borderColor: color, borderWidth: 1.5, height: 14, transform: [{ rotate: '45deg' }], width: 14 }} />;
}
function MapIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={{ height: 16, justifyContent: 'space-between', width: 18 }}>
    <View style={{ backgroundColor: color, height: 2, width: 18 }} />
    <View style={{ backgroundColor: color, height: 2, width: 18 }} />
    <View style={{ backgroundColor: color, height: 2, width: 18 }} />
  </View>;
}
function EyeIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={{ alignItems: 'center', borderColor: color, borderRadius: 10, borderWidth: 1.5, height: 12, justifyContent: 'center', width: 19 }}>
    <View style={{ backgroundColor: color, borderRadius: 2.5, height: 5, width: 5 }} />
  </View>;
}
function OrbitIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={{ borderColor: color, borderRadius: 9, borderWidth: 1.5, height: 18, width: 18 }}>
    <View style={{ backgroundColor: color, borderRadius: 2, height: 4, left: 6, position: 'absolute', top: 5.5, width: 4 }} />
  </View>;
}
function MoveIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={{ height: 18, width: 18 }}>
    <View style={{ backgroundColor: color, height: 2, left: 1, position: 'absolute', top: 8, width: 16 }} />
    <View style={{ backgroundColor: color, height: 16, left: 8, position: 'absolute', top: 1, width: 2 }} />
  </View>;
}
