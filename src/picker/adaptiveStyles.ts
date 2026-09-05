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
  legendBand: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: seatLayerPickerTokens.size.topRailHeight,
    justifyContent: 'center',
  },
  controlsOverlay: absoluteFillObject,
  floorRail: { position: 'absolute', left: 0, right: 0 },
  testRail: { position: 'absolute', left: seatLayerPickerTokens.size.mapAnchorInset },
  accessRail: { position: 'absolute', left: seatLayerPickerTokens.size.mapAnchorInset },
  floorSelectorRail: { position: 'absolute', left: seatLayerPickerTokens.size.mapAnchorInset },
  dockRail: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  wideMapOverlays: absoluteFillObject,
  wideTestRail: { position: 'absolute', top: seatLayerPickerTokens.size.mapAnchorInset, left: seatLayerPickerTokens.size.mapAnchorInset },
  wideControlsRail: { position: 'absolute', top: seatLayerPickerTokens.size.mapAnchorInset, right: seatLayerPickerTokens.size.mapAnchorInset },
  wideFloorSelectorRail: { position: 'absolute', left: seatLayerPickerTokens.size.mapAnchorInset, bottom: seatLayerPickerTokens.size.mapAnchorInset },
  wideFloors: { paddingTop: 8 },
  wideAssist: { gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 0 },
  wideCart: { flex: 1 },
  wideCartContent: { flexGrow: 1 },
  trailingAttribution: { alignItems: 'flex-end', paddingEnd: 8 },
  owner: { ...absoluteFillObject, justifyContent: 'center' },
  phoneFooter: { alignSelf: 'stretch', width: '100%' },
});
