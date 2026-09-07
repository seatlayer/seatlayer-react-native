import React, { useMemo, useRef, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  canRenderSeatLayerPickerAccessibilityFilters,
  SeatLayerPickerAccessibilityFilters,
} from './accessibility';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { useSeatLayerPickerInsetLease } from './insetLeaseLifecycle';
import { blendSeatLayerPickerColor, focusedPickerSection, usePickerSingleFlight } from './pickerNavigation';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { SeatLayerPickerAccessibleStepper } from './SeatLayerPickerAccessibleStepper';
import { SeatLayerPickerBlockedRegion } from './blockedRegionsContext';
import { seatLayerPickerMapChromeGround } from './mapChromeTheme';
import {
  SeatLayerPickerBackIcon,
  SeatLayerPickerFocusCornersIcon,
  SeatLayerPickerMinusIcon,
  SeatLayerPickerPlusIcon,
} from './mapControlIcons';
import {
  seatLayerPickerViewModeTrackInset,
  SeatLayerPickerViewModeControlView,
} from './mapViewModeControl';
import { seatLayerPickerTokens } from './tokens.g';

export {
  SeatLayerPickerBackIcon,
  SeatLayerPickerFocusCornersIcon,
  SeatLayerPickerMinusIcon,
  SeatLayerPickerPlusIcon,
} from './mapControlIcons';
export {
  seatLayerPickerViewModeTrackInset,
  SeatLayerPickerViewModeControlView,
} from './mapViewModeControl';

export interface SeatLayerMapControlsProps {
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<
    SeatLayerPickerStyles,
    | 'mapControlsContainer'
    | 'mapControlButton'
    | 'mapControlLabel'
    | 'accessibilityControlsContainer'
    | 'accessibilityControlButton'
    | 'accessibilityControlLabel'
  >;
  readonly edgeInset?: number;
  readonly bottomInset?: number;
  readonly enable3D?: boolean;
  readonly showZoomControls?: boolean;
  /** On compact layouts, replace Fit with one level of map return while zoomed in. */
  readonly showStepOutControl?: boolean;
  readonly showZoomToFitControl?: boolean;
  readonly showOverviewControl?: boolean;
  readonly showAccessibilityControl?: boolean;
  readonly includeViewModeControl?: boolean;
  /**
   * §3.5, 0.9.1: the disc column steps out of the way of a seat card. A column
   * of controls poking out beside the sheet asking about a seat reads as
   * clutter, and none of them may be pressed while it asks. The card owner
   * (Lane A) reports the asking state; the column only fades on it.
   */
  readonly cardAsking?: boolean;
  /**
   * The control drawn at the HEAD of the map's control column. Undefined draws
   * the picker's own accessibility disc, so a host that replaces the filter
   * control still has it placed here rather than rebuilding the column.
   */
  readonly accessibilityControl?: ReactNode;
  /** Hosts may supply localized zoom labels when generated copy is unavailable. */
  readonly zoomInLabel?: string;
  readonly zoomOutLabel?: string;
  readonly reserveInset?: boolean;
  /** Measures the rendered Map/3D control so a sibling rail can reserve its localized width. */
  readonly onViewModeLayout?: (width: number) => void;
}

/** §3.5 anchor regions: `size.mapAnchorGap` between members of one region. */
const controlGap = seatLayerPickerTokens.size.mapAnchorGap;
/** The zoom column is a column, not an anchor region; it carries its own gap. */
const zoomColumnGap = seatLayerPickerTokens.size.zoomColumnGap;
/** §3.5: every floating control is inset `size.mapAnchorInset` from the map's edges. */
export const seatLayerPickerMapControlsEdgeInset = seatLayerPickerTokens.size.mapAnchorInset;
/**
 * The top-corner band. The map's own corners are inset by `mapAnchorInset`, but
 * the band along its top edge — the Map/3D control and the test chip — sits
 * higher: they share a line with the price rail above them rather than floating
 * in the map's corner, and the corner inset put them a rung too low.
 */
export const seatLayerPickerMapControlsRailTop = 8;
/**
 * The air a corner disc carries around itself so its press target clears the
 * touch floor. The anchor takes it back: the region's inset is measured to the
 * DISC, and counting the reach as well set the disc a bed in from its corner.
 */
export const seatLayerPickerMapControlsDiscBed =
  (seatLayerPickerTokens.size.minimumHitTarget -
    seatLayerPickerTokens.size.mapControlSize) / 2;

type BottomControlPlan = Readonly<{ height: number }>;

/**
 * The bottom-right column's own height: one target per member, the token gap
 * between them. Every member is laid out at the touch target rather than at
 * the disc, so the reach is the same for the head of the column and its foot.
 */
export function planSeatLayerMapBottomControls(
  members: number,
  target: number,
): BottomControlPlan {
  const count = Number.isFinite(members) ? Math.max(0, Math.trunc(members)) : 0;
  if (count === 0) return Object.freeze({ height: 0 });
  return Object.freeze({ height: count * target + (count - 1) * zoomColumnGap });
}

type MapCameraReading = Readonly<{
  focusedSectionId?: string;
  rung?: string;
  atVenueFit?: boolean;
  canZoomIn?: boolean;
  canZoomOut: boolean;
}>;

/**
 * §3.5 "the reading behind both back-out discs is one reading". A framed
 * section always has a rung left — leaving it is a step even at the fit pose,
 * card and dim included. Otherwise `map.atVenueFit` decides: the fit pose is
 * the one camera with nothing left to offer. Where the runtime does not report
 * it the field is ABSENT, never `false`, and `map.canZoomOut` is the older,
 * coarser fallback (§4.9) — an absent reading is never read as a pose.
 */
export function seatLayerPickerMapCanStepBack(map: MapCameraReading): boolean {
  if (map.focusedSectionId !== undefined) return true;
  if (map.atVenueFit !== undefined) return !map.atVenueFit;
  return map.canZoomOut;
}

/**
 * §3.5 `\u2212`, which exists on the WIDE composition and in a host's own
 * composition only. Live once the buyer is in among the seats and the ladder
 * still has a rung: at a section's own frame the only step back is the whole
 * venue, and that is a different control (owner, 2026-09-06). Two discs for
 * one move read as a puzzle.
 */
export function seatLayerPickerMapCanStepOut(map: MapCameraReading): boolean {
  return map.rung === 'seats' && seatLayerPickerMapCanStepBack(map);
}

/**
 * §3.5, web 0.84.0: `+` RETIRES rather than dims once the buyer is among the
 * seats or at the zoom ceiling — a disc that does nothing is the broken-map
 * reading. `canZoomIn` is present-only, so only an explicit `false` retires it;
 * an absent reading means the engine cannot say, which is not a ceiling.
 */
export function seatLayerPickerMapZoomInRetired(map: MapCameraReading): boolean {
  return map.rung === 'seats' || map.canZoomIn === false;
}

function inset(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

/** Scoped map controls. Its view layer takes already-gated availability and callbacks. */
export function SeatLayerMapControls(props: SeatLayerMapControlsProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const snapshot = scope.snapshot;
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  const requestedAction = useRef<Readonly<{
    kind: 'overview' | 'wholeVenue' | 'zoomIn' | 'zoomOut' | 'fit' | 'map' | 'venue3d';
    sessionId: number;
  }> | undefined>(undefined);
  const [actionBusy, runAction] = usePickerSingleFlight(
    scope.sessionId, scope.reportError, async () => {
      const request = requestedAction.current;
      const action = request?.kind;
      const controller = scope.controller;
      const sessionId = scope.sessionId;
      const latest = controller.getSnapshot();
      if (!action || request?.sessionId !== sessionId || latest === undefined || controller !== scope.controller ||
        latest.map.buyerView !== 'map' && latest.map.buyerView !== 'venue3d') return undefined;
      const currentView = latest.map.buyerView;
      const execute = async (command: string, capabilities: readonly string[], run: () => Promise<unknown>) => {
        if (!supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1', ...capabilities], [command])) {
          return;
        }
        await run();
        if (controller !== scope.controller || sessionId !== scope.sessionId) return;
      };
      if (action === 'overview') {
        if (currentView !== 'map' || focusedPickerSection(latest) === undefined) return undefined;
        await execute('picker.overview', [], () => controller.overview());
      } else if (action === 'wholeVenue') {
        // ALWAYS LIVE, and always `picker.overview` rather than
        // `picker.zoomToFit`: it has to land on exactly the camera the ladder's
        // last rung lands on — a framed section released, its card closed, its
        // dim cleared — so the two can never disagree about where the whole
        // venue is. The camera facts in a snapshot are only as fresh as the
        // last state change and a pinch changes none, so gating this disc on
        // one strands a buyer on a stale reading; at the venue already the
        // press is a harmless no-op.
        if (currentView !== 'map') return undefined;
        await execute('picker.overview', [], () => controller.overview());
      } else if (action === 'fit') {
        if (currentView !== 'map') return undefined;
        await execute('picker.zoomToFit', ['zoom'], () => controller.zoomToFit());
      } else if (action === 'zoomIn') {
        // Absent is not "no": only an explicit `false` is the zoom ceiling.
        if (currentView !== 'map' || latest.map.canZoomIn === false) return undefined;
        await execute('picker.zoomIn', ['zoom'], () => controller.zoomIn());
      } else if (action === 'zoomOut') {
        if (currentView !== 'map' || !seatLayerPickerMapCanStepOut(latest.map)) return undefined;
        await execute('picker.zoomOut', ['zoom'], () => controller.zoomOut());
      } else {
        if (!latest.capabilities.includes('venue3d') || currentView === action) return undefined;
        await execute('picker.setBuyerView', ['venue-3d-v1'], () => controller.setBuyerView(action));
      }
      return undefined;
    },
  );
  const compact = props.compact ?? true;
  const edgeInset = inset(props.edgeInset, seatLayerPickerMapControlsEdgeInset);
  const bottomInset = inset(props.bottomInset, 0);
  const target = scope.resolvedTheme.layout.minimumHitTarget;
  const supports = (command: string, capabilities: readonly string[] = []) =>
    supportsSeatLayerPickerSurface(
      scope.controller,
      ['native-chrome-contract-v1', ...capabilities],
      [command],
    );
  const buyerView = snapshot?.map.buyerView === 'venue3d'
    ? 'venue3d'
    : snapshot?.map.buyerView === 'map' ? 'map' : undefined;
  const viewAvailable = snapshot !== undefined && props.enable3D !== false &&
    props.includeViewModeControl !== false && snapshot.capabilities.includes('venue3d') &&
    supports('picker.setBuyerView', ['venue-3d-v1']);
  const zoomInLabel = typeof props.zoomInLabel === 'string' && props.zoomInLabel.trim()
    ? props.zoomInLabel.trim() : scope.strings.translate('zoomIn');
  const zoomOutLabel = typeof props.zoomOutLabel === 'string' && props.zoomOutLabel.trim()
    ? props.zoomOutLabel.trim() : scope.strings.translate('zoomOut');
  // The wide rail keeps `+` and `-`; the phone's column carries `+` alone,
  // because pinch already steps the camera out and the disc below goes home.
  const zoomPairAvailable = snapshot !== undefined && buyerView === 'map' && !compact &&
    props.showZoomControls === true &&
    supports('picker.zoomIn', ['zoom']) && supports('picker.zoomOut', ['zoom']);
  // §3.5 phone column. `+` steps in and the framed dot puts the whole venue on
  // screen from any depth; there is no `-` between them (owner, 2026-09-06): a
  // `-` that only sometimes had a step to take read as a control that
  // sometimes worked.
  const zoomInSlotAvailable = snapshot !== undefined && buyerView === 'map' && compact &&
    props.showStepOutControl !== false && supports('picker.zoomIn', ['zoom']);
  // A retired `+` KEEPS ITS SLOT (web 0.84.1): the column is anchored at its
  // foot, so a disc that left the tree moved the accessibility disc that heads
  // it under the thumb already reaching for that disc.
  const zoomInRetired = snapshot !== undefined &&
    seatLayerPickerMapZoomInRetired(snapshot.map);
  // The phone's whole-venue disc. The wide layout draws NO fit control of its
  // own any more (2026-09-06): two ways to frame the same flat venue on one
  // composition is one too many, and the one that went is the one a pinch
  // already does. `SeatLayerPickerZoomToFitButton` stays public for a host.
  const wholeVenueAvailable = snapshot !== undefined && buyerView === 'map' && compact &&
    props.showZoomToFitControl !== false && supports('picker.overview');
  const fitAvailable = false;
  const showOverview = props.showOverviewControl ?? !compact;
  const overviewAvailable = snapshot !== undefined && buyerView === 'map' &&
    showOverview && focusedPickerSection(snapshot) !== undefined &&
    supports('picker.overview');
  const accessAvailable = buyerView === 'map' &&
    props.showAccessibilityControl !== false &&
    (props.accessibilityControl !== undefined ||
      canRenderSeatLayerPickerAccessibilityFilters(scope.controller, snapshot));
  const ownsVisibleControl = viewAvailable || wholeVenueAvailable || zoomInSlotAvailable ||
    zoomPairAvailable || overviewAvailable || accessAvailable;
  const bottomPlan = planSeatLayerMapBottomControls(
    (accessAvailable ? 1 : 0) + (zoomInSlotAvailable ? 1 : 0) + (wholeVenueAvailable ? 1 : 0),
    target,
  );
  const insetLease = useMemo(
    () => props.reserveInset ? scope.claimViewportInsetBand('mapControls') : undefined,
    [props.reserveInset, scope.claimViewportInsetBand, scope.sessionId],
  );
  useSeatLayerPickerInsetLease(
    insetLease,
    compact && ownsVisibleControl && bottomPlan.height > 0
      ? { bottom: bottomInset + edgeInset + bottomPlan.height }
      : undefined,
  );
  if (snapshot === undefined || buyerView === undefined || !ownsVisibleControl) return null;
  const disabled = scope.isBusy || actionBusy;
  // THE SAME DISC ON BOTH COMPOSITIONS (§3.5): it floats on the map either
  // way, so the wide side does not get a labelled button of its own. `compact`
  // is the disc form here, not the layout.
  const accessibilityControl = !accessAvailable
    ? null
    : props.accessibilityControl ?? <SeatLayerPickerAccessibilityFilters
        compact
        modalBottomInset={bottomInset + edgeInset}
        modalHorizontalInset={edgeInset}
        modalTopInset={edgeInset}
        slots={props.slots}
      />;
  return (
    <SeatLayerMapControlsView
      {...props}
      slots={styles}
      accessibilityControl={accessibilityControl}
      bottomInset={bottomInset}
      canFit={fitAvailable}
      canOverview={overviewAvailable}
      canZoomIn={zoomPairAvailable && snapshot.map.canZoomIn !== false}
      canZoomOut={zoomPairAvailable && seatLayerPickerMapCanStepOut(snapshot.map)}
      compact={compact}
      disabled={disabled}
      edgeInset={edgeInset}
      onFit={() => { requestedAction.current = Object.freeze({ kind: 'fit', sessionId: scope.sessionId }); runAction(); }}
      onOverview={() => { requestedAction.current = Object.freeze({ kind: 'overview', sessionId: scope.sessionId }); runAction(); }}
      onView={(view) => {
        requestedAction.current = Object.freeze({ kind: view, sessionId: scope.sessionId });
        runAction();
      }}
      onZoomIn={() => { requestedAction.current = Object.freeze({ kind: 'zoomIn', sessionId: scope.sessionId }); runAction(); }}
      onZoomOut={() => { requestedAction.current = Object.freeze({ kind: 'zoomOut', sessionId: scope.sessionId }); runAction(); }}
      onWholeVenue={() => {
        requestedAction.current = Object.freeze({ kind: 'wholeVenue', sessionId: scope.sessionId });
        runAction();
      }}
      zoomInLabel={zoomInLabel}
      zoomOutLabel={zoomOutLabel}
      buyerView={buyerView}
      strings={scope.strings}
      theme={resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, snapshot)}
      target={target}
      viewBusy={actionBusy}
      venue3DAvailable={viewAvailable}
      onViewModeLayout={props.onViewModeLayout}
      zoomPairAvailable={zoomPairAvailable}
      zoomInSlotAvailable={zoomInSlotAvailable}
      zoomInRetired={zoomInRetired}
      wholeVenueAvailable={wholeVenueAvailable}
      accessibleStepper={accessAvailable ? <SeatLayerPickerAccessibleStepper /> : null}
      zoomInBusy={actionBusy}
      zoomOutBusy={actionBusy}
      fitBusy={actionBusy}
      overviewBusy={actionBusy}
    />
  );
}

/**
 * §3.5 — the map's floating controls, in their anchor regions.
 *
 * ONE COLUMN, BOTTOM-RIGHT, ON BOTH COMPOSITIONS (owner, 2026-09-06). The
 * accessibility disc HEADS it and the zoom discs follow: who can sit where is
 * an earlier question than how close the camera is, and the disc used to stand
 * alone in the corner the floor rail already owns, which read as something the
 * layout had forgotten.
 */
function SeatLayerMapControlsView({
  compact,
  style,
  slots,
  target,
  edgeInset,
  bottomInset = 0,
  zoomInLabel,
  zoomOutLabel,
  buyerView,
  disabled,
  canZoomIn,
  canZoomOut,
  canFit,
  canOverview,
  zoomPairAvailable,
  zoomInSlotAvailable,
  zoomInRetired,
  wholeVenueAvailable,
  venue3DAvailable,
  zoomInBusy,
  zoomOutBusy,
  fitBusy,
  overviewBusy,
  viewBusy,
  cardAsking = false,
  theme,
  strings,
  onOverview,
  onZoomIn,
  onZoomOut,
  onWholeVenue,
  onFit,
  onView,
  onViewModeLayout,
  accessibilityControl,
  accessibleStepper,
}: SeatLayerMapControlsProps & {
  readonly edgeInset: number;
  readonly target: number;
  readonly buyerView: 'map' | 'venue3d' | undefined;
  readonly disabled: boolean;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly canFit: boolean;
  readonly canOverview: boolean;
  readonly zoomPairAvailable: boolean;
  readonly zoomInSlotAvailable: boolean;
  readonly zoomInRetired: boolean;
  readonly wholeVenueAvailable: boolean;
  readonly venue3DAvailable: boolean;
  readonly onViewModeLayout?: (width: number) => void;
  readonly zoomInBusy: boolean;
  readonly zoomOutBusy: boolean;
  readonly fitBusy: boolean;
  readonly overviewBusy: boolean;
  readonly viewBusy: boolean;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly strings: ReturnType<typeof useSeatLayerPickerScope>['strings'];
  readonly onOverview: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onWholeVenue: () => void;
  readonly onFit: () => void;
  readonly onView: (view: 'map' | 'venue3d') => void;
  readonly accessibilityControl: ReactNode;
  readonly accessibleStepper?: ReactNode;
}): React.ReactElement {
  const bottom = edgeInset + bottomInset;
  const discBed = seatLayerPickerMapControlsDiscBed;
  const onMap = buyerView === 'map';
  const usableZoomInLabel = typeof zoomInLabel === 'string' ? zoomInLabel.trim() : '';
  const usableZoomOutLabel = typeof zoomOutLabel === 'string' ? zoomOutLabel.trim() : '';
  const control = (label: string, enabled: boolean, onPress: () => void, icon: ReactNode) => (
    <SeatLayerMapControlButtonView
      enabled={enabled && !disabled}
      label={label}
      slots={slots}
      theme={theme}
      target={target}
      onPress={onPress}
    >
      {icon}
    </SeatLayerMapControlButtonView>
  );
  const overview = control(
    strings.translate('backToVenue'),
    canOverview && !overviewBusy,
    onOverview,
    <SeatLayerPickerBackIcon color={theme.colors.text} />,
  );
  const zoomIn = !usableZoomInLabel ? null : control(
    usableZoomInLabel,
    canZoomIn && !zoomInBusy,
    onZoomIn,
    <SeatLayerPickerPlusIcon color={theme.colors.text} />,
  );
  const zoomOut = !usableZoomOutLabel ? null : control(
    usableZoomOutLabel,
    canZoomOut && !zoomOutBusy,
    onZoomOut,
    <SeatLayerPickerMinusIcon color={theme.colors.text} />,
  );
  const phoneZoomIn = !usableZoomInLabel ? null : control(
    usableZoomInLabel,
    !zoomInRetired && !zoomInBusy,
    onZoomIn,
    <SeatLayerPickerPlusIcon color={theme.colors.text} />,
  );
  // The last rung of the ladder on its own, from any depth. ALWAYS live.
  const wholeVenue = control(
    strings.translate('fitWholeVenue'),
    !fitBusy,
    onWholeVenue,
    <SeatLayerPickerFocusCornersIcon color={theme.colors.text} />,
  );
  const fit = control(
    strings.translate('fitVenue'),
    canFit && !fitBusy,
    onFit,
    <SeatLayerPickerFocusCornersIcon color={theme.colors.text} />,
  );
  const view = venue3DAvailable ? (
    <SeatLayerPickerViewModeControlView
      disabled={disabled || viewBusy}
      buyerView={buyerView}
      slots={slots}
      strings={strings}
      theme={theme}
      target={target}
      onPress={onView}
      onLayout={onViewModeLayout}
    />
  ) : null;
  // The stepper rides BESIDE the accessibility disc rather than above it
  // (§3.4.1): they are one subject, and it sits on the disc's inner side so
  // the column's own right edge stays the discs'.
  const head = accessibilityControl === null ? null : (
    <View style={{
      alignItems: 'center',
      flexDirection: 'row',
      gap: seatLayerPickerTokens.size.accessStepGap,
      justifyContent: 'flex-end',
    }}>
      {accessibleStepper}
      {accessibilityControl}
    </View>
  );
  if (!compact) {
    return (
      <SeatLayerPickerBlockedRegion
        style={[
          { alignSelf: 'flex-end', gap: controlGap },
          slots?.mapControlsContainer,
          sanitizeSeatLayerPickerStyle(style),
        ]}
      >
        {head}
        {onMap && canOverview ? overview : null}
        {onMap && zoomPairAvailable ? (
          <View style={{ gap: zoomColumnGap }}>{zoomIn}{zoomOut}</View>
        ) : null}
        {onMap && canFit ? fit : null}
        {view}
      </SeatLayerPickerBlockedRegion>
    );
  }
  // Every member of the column is laid out at the touch target, so the head of
  // the column and its foot have the same reach and the token gap is measured
  // between the DISCS. The anchor takes the reach back on both axes: the
  // region's inset is measured to the disc, not to the target around it.
  const member = (child: ReactNode, first: boolean, hidden = false) => (
    <View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={{
        alignItems: 'flex-end',
        justifyContent: 'center',
        marginTop: first ? 0 : zoomColumnGap - discBed * 2,
        minHeight: target,
        opacity: hidden ? 0 : 1,
      }}
    >
      {child}
    </View>
  );
  const columnMembers: ReactNode[] = [];
  if (onMap && head !== null) columnMembers.push(member(head, columnMembers.length === 0));
  if (onMap && zoomInSlotAvailable) {
    columnMembers.push(member(phoneZoomIn, columnMembers.length === 0, zoomInRetired));
  }
  if (onMap && wholeVenueAvailable) {
    columnMembers.push(member(wholeVenue, columnMembers.length === 0));
  }
  return (
    <View
      pointerEvents={cardAsking ? 'none' : 'box-none'}
      style={[
        { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
        slots?.mapControlsContainer,
        sanitizeSeatLayerPickerStyle(style),
        { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
      ]}
    >
      {/* §3.5, 0.9.1: while a card asks, the corner DISC COLUMN goes — a
          stack of controls poking out beside the sheet asking about a seat
          reads as clutter. Map | 3D is NOT one of those discs: it belongs to
          the top rail, is read with the prices rather than with the map's
          corners, and it stays FULLY DRAWN while a card asks (reference
          frames 03b and 19 both show it at full strength beside a card).
          §3.8.1's "the anchors dim" is about the map's own anchors; dimming
          the rail as well says the map lost its 3D. Nothing here takes a
          press either way — the guard is on the parent. */}
      {view ? (
        <SeatLayerPickerBlockedRegion style={{
          end: edgeInset,
          position: 'absolute',
          top: seatLayerPickerMapControlsRailTop - seatLayerPickerViewModeTrackInset,
        }}>
          {view}
        </SeatLayerPickerBlockedRegion>
      ) : null}
      {cardAsking ? null : columnMembers.length > 0 ? (
        <SeatLayerPickerBlockedRegion
          style={{
            alignItems: 'flex-end',
            bottom: bottom - discBed,
            end: edgeInset - discBed,
            position: 'absolute',
          }}
        >
          {columnMembers.map((entry, index) => (
            <React.Fragment key={index}>{entry}</React.Fragment>
          ))}
        </SeatLayerPickerBlockedRegion>
      ) : null}
      {onMap && canOverview ? (
        <SeatLayerPickerBlockedRegion style={{ position: 'absolute', start: edgeInset - discBed, top: edgeInset - discBed }}>
          {overview}
        </SeatLayerPickerBlockedRegion>
      ) : null}
    </View>
  );
}


export function SeatLayerMapControlButtonView({
  label,
  enabled,
  active = false,
  selected,
  theme,
  target,
  slots,
  style,
  onPress,
  children,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly active?: boolean;
  /** Set only for true toggle controls; ordinary action buttons omit selection semantics. */
  readonly selected?: boolean;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly target: number;
  readonly slots: SeatLayerMapControlsProps['slots'];
  readonly style?: StyleProp<ViewStyle>;
  readonly onPress: () => void;
  readonly children: ReactNode;
}): React.ReactElement {
  const size = theme.layout.mapControlSize;
  const chrome = seatLayerPickerMapChromeGround(theme);
  // §3.5 "a disabled disc has to look disabled". These controls dim in place
  // rather than disappearing, which only works as an answer — "you are already
  // looking at everything" — if the buyer can see that it is one. The disc
  // KEEPS ITS GROUND in both themes; only the glyph and the ring step back, at
  // `opacity.mapControlDisabled`, and the shadow goes: it is no longer lifted
  // off the map, because it is no longer a thing to press. A wash over the
  // whole disc read as a grey blot on the light map and vanished on the dark.
  const dim = seatLayerPickerTokens.opacity.mapControlDisabled;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{
        disabled: !enabled,
        ...(selected === undefined ? {} : { selected }),
      }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        height: target,
        justifyContent: 'center',
        opacity: enabled && pressed ? 0.72 : 1,
        width: target,
      })}
    >
      <View
        style={[
          {
            alignItems: 'center',
            backgroundColor: active
              ? blendSeatLayerPickerColor(theme.colors.accent, chrome.ground, .13, chrome.ground)
              : chrome.ground,
            borderColor: enabled
              ? chrome.line
              : blendSeatLayerPickerColor(chrome.line, chrome.ground, dim, chrome.line),
            // A DISC. The corner controls are round: at the button radius the
            // back-out control read as a tile dropped on the venue beside the
            // round accessibility control opposite it.
            borderRadius: seatLayerPickerTokens.radius.pill,
            borderWidth: 1,
            height: size,
            justifyContent: 'center',
            width: size,
            // The shadow goes with the press, not with the ground.
            ...(enabled
              ? {
                elevation: 3,
                shadowColor: theme.colors.text,
                shadowOffset: { height: 3, width: 0 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
              }
              : { elevation: 0, shadowOpacity: 0 }),
          },
          slots?.mapControlButton,
          sanitizeSeatLayerPickerStyle(style),
          { height: size, width: size },
        ]}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : dim }}>
          {children}
        </View>
      </View>
    </Pressable>
  );
}
