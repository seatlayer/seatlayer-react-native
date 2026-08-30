import { StyleSheet, type ViewStyle } from 'react-native';

import { seatLayerPickerTokens } from './tokens.g';

const absoluteFillObject = (StyleSheet as typeof StyleSheet & Readonly<{
  absoluteFillObject?: ViewStyle;
}>).absoluteFillObject ?? StyleSheet.absoluteFill;

export const seatLayerPickerAdaptiveStyles = StyleSheet.create({
  root: { flex: 1 },
  safeAreaContent: { flex: 1 },
  phone: { flex: 1 },
  wide: { flex: 1, flexDirection: 'row' },
  map: { flex: 1, overflow: 'hidden', position: 'relative' },
  chartOwner: { flex: 1 },
  rail: { borderStartWidth: StyleSheet.hairlineWidth },
  phoneOverlays: absoluteFillObject,
  legendRail: { position: 'absolute', top: 0, left: 0, right: seatLayerPickerTokens.size.minimumHitTarget },
  controlsOverlay: absoluteFillObject,
  floorRail: { position: 'absolute', left: 0, right: 0 },
  testRail: { position: 'absolute', left: 10 },
  accessRail: { position: 'absolute', left: 10 },
  floorSelectorRail: { position: 'absolute', left: 10 },
  dockRail: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  wideMapOverlays: absoluteFillObject,
  wideTestRail: { position: 'absolute', top: 12, left: 12 },
  wideControlsRail: { position: 'absolute', top: 12, right: 12 },
  wideFloorSelectorRail: { position: 'absolute', left: 12, bottom: 12 },
  wideFloors: { paddingTop: 8 },
  wideAssist: { gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 0 },
  wideCart: { flex: 1 },
  wideCartContent: { flexGrow: 1 },
  owner: { ...absoluteFillObject, justifyContent: 'center' },
  phoneFooter: { alignSelf: 'stretch', width: '100%' },
});
