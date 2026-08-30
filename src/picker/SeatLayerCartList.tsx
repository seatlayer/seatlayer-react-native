import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { I18nManager, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { CartRemovalUndoCoordinator } from './cartRemovalUndoState';
import { chartSeatLayerPickerColor } from './chartColor';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import { captureSeatLayerCartActionLease, isSeatLayerCartActionCurrent, projectSeatLayerCartRuns, projectSeatLayerCartSheet, visibleSeatLayerCartRuns } from './cartSheetUi';
import { runMembersInSeatOrder, type DenseTicketLine, type DenseTicketRun } from './cartDense';
import type { SeatLayerPickerCartLine } from './models';

export interface SeatLayerCartListProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles, 'denseLineContainer' | 'denseLineText' | 'denseLineRemoveButton' | 'denseLineRemoveButtonText'>;
  readonly onSeatRemoved?: (line: Readonly<SeatLayerPickerCartLine>) => unknown;
  readonly onUndo?: (labels: readonly string[]) => unknown;
  readonly children?: ReactNode;
}

type Current = ReturnType<typeof useSeatLayerPickerScope>;

function observe(callback: unknown, value: unknown): void {
  if (typeof callback !== 'function') return;
  try { void Promise.resolve(callback(value)).catch(() => {}); } catch { /* Observers cannot affect a cart command. */ }
}

function timer() {
  return { setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay), clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
}

/** Dense, folded confirmed-cart list with native four-second undo. */
export function SeatLayerCartList(props: SeatLayerCartListProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const current = useRef<Current>(scope);
  const observers = useRef({ onSeatRemoved: props.onSeatRemoved, onUndo: props.onUndo });
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  const coordinator = useRef(new CartRemovalUndoCoordinator<SeatLayerPickerCartLine>(timer(), () => {
    if (mounted.current) setVersion((value) => value + 1);
  }));
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const flight = useRef<number | null>(null);
  const revision = useRef(-1);
  useLayoutEffect(() => { current.current = scope; observers.current = { onSeatRemoved: props.onSeatRemoved, onUndo: props.onUndo }; }, [props.onSeatRemoved, props.onUndo, scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; coordinator.current.dispose(); }; }, []);
  useLayoutEffect(() => { coordinator.current.reset(); flight.current = null; revision.current = -1; setOpenRuns(new Set()); setShowAll(false); setVersion((value) => value + 1); }, [scope.controller, scope.sessionId, scope.snapshot?.sessionId]);
  useLayoutEffect(() => {
    const snapshot = scope.snapshot;
    if (!snapshot || snapshot.revision <= revision.current) return;
    revision.current = snapshot.revision;
    const before = coordinator.current.state.active;
    const after = coordinator.current.reconcile(snapshot.cartLines).active;
    if (before !== after) setVersion((value) => value + 1);
  }, [scope.snapshot]);

  const projection = useMemo(
    () => projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat),
    [scope.snapshot, scope.pendingSeat, version],
  );
  const renderableItems = coordinator.current.projectVisibleLines(projection.confirmed.items);
  const renderProjection = { ...projection, runs: projectSeatLayerCartRuns(scope.snapshot, renderableItems) };
  const visible = visibleSeatLayerCartRuns(renderProjection, showAll);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const visibleRuns = visible.visible;
  if (!visibleRuns.length && coordinator.current.state.active === null) return null;
  const canRemove = !scope.readOnly && !scope.isBusy && scope.snapshot?.hold.owner !== 'host' &&
    supportsSeatLayerPickerSurface(scope.controller, ['cart-line-remove-v1'], ['picker.removeCartLine']);
  const remove = async (line: DenseTicketLine<SeatLayerPickerCartLine>) => {
    const before = current.current;
    const lease = captureSeatLayerCartActionLease(before.controller, before.sessionId);
    const live = lease?.controller.getSnapshot();
    if (!lease || !live || flight.current !== null || before.readOnly || before.isBusy || live.hold.owner === 'host' ||
      !supportsSeatLayerPickerSurface(before.controller, ['cart-line-remove-v1'], ['picker.removeCartLine'])) return;
    const liveProjection = projectSeatLayerCartSheet(live, before.pendingSeat);
    if (!liveProjection.confirmed.items.some((item) => item.lineKey === line.item.lineKey && item.label === line.item.label)) return;
    const started = coordinator.current.begin(line.item, before.sessionId);
    if (!started.intent || !started.state.active) return;
    const token = started.state.active.token;
    flight.current = token;
    setVersion((value) => value + 1);
    try {
      await before.controller.removeCartLine(started.intent.labels[0]!);
      if (!mounted.current || !isSeatLayerCartActionCurrent(lease, current.current) || flight.current !== token) return;
      coordinator.current.acknowledgeSuccess(token);
      observe(observers.current.onSeatRemoved, Object.freeze({ ...line.item }));
    } catch (error) {
      if (mounted.current && isSeatLayerCartActionCurrent(lease, current.current) && flight.current === token) {
        coordinator.current.failRemoval(token);
        try { current.current.reportError(error); } catch { /* scope reporting is advisory */ }
      }
    } finally {
      if (flight.current === token) flight.current = null;
      if (mounted.current && isSeatLayerCartActionCurrent(lease, current.current)) setVersion((value) => value + 1);
    }
  };
  const undo = async () => {
    const before = current.current;
    const lease = captureSeatLayerCartActionLease(before.controller, before.sessionId);
    const active = coordinator.current.state.active;
    if (!lease || !active || active.phase !== 'undo-window' || flight.current !== null || before.readOnly || before.isBusy || lease.controller.getSnapshot()?.hold.owner === 'host' || !supportsSeatLayerPickerSurface(before.controller, ['picker-actions-v1'], ['picker.selectObjects'])) return;
    const result = coordinator.current.undo(active.token, before.sessionId);
    if (!result.intent) return;
    flight.current = active.token;
    setVersion((value) => value + 1);
    try {
      await before.controller.selectObjects([...result.intent.objects]);
      if (!mounted.current || !isSeatLayerCartActionCurrent(lease, current.current) || flight.current !== active.token) return;
      coordinator.current.completeUndo(active.token);
      observe(observers.current.onUndo, Object.freeze([...result.intent.objects]));
    } catch (error) {
      if (mounted.current && isSeatLayerCartActionCurrent(lease, current.current) && flight.current === active.token) {
        coordinator.current.failUndo(active.token);
        try { current.current.reportError(error); } catch { /* contained */ }
      }
    } finally {
      if (flight.current === active.token) flight.current = null;
      if (mounted.current && isSeatLayerCartActionCurrent(lease, current.current)) setVersion((value) => value + 1);
    }
  };
  const undoActive = coordinator.current.state.active;
  return (
    <View style={[sanitizeSeatLayerPickerStyle(props.style), { direction: I18nManager.isRTL ? 'rtl' : 'ltr' }]}>
      {visibleRuns.map((run) => { const runKey = JSON.stringify(run.members.map((member) => [member.identity.lineKey, member.identity.removalLabel, member.identity.objectId, member.identity.seatId])); return <Run key={runKey} run={run} open={openRuns.has(runKey)} canRemove={canRemove} theme={theme} styles={styles} onToggle={() => setOpenRuns((value) => { const next = new Set(value); next.has(runKey) ? next.delete(runKey) : next.add(runKey); return next; })} onRemove={remove} />; })}
      {visible.canToggle ? <Pressable accessibilityRole="button" accessibilityLabel={scope.strings.translate(showAll ? 'showLess' : 'moreCount', { values: { count: visible.hiddenCount }, count: visible.hiddenCount })} onPress={() => setShowAll((value) => !value)} style={{ minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center', paddingHorizontal: 8 }}><Text style={[{ color: theme.colors.accent, fontFamily: theme.fontFamily, fontSize: 12, fontWeight: '800' }, styles.denseLineText]}>{scope.strings.translate(showAll ? 'showLess' : 'moreCount', { values: { count: visible.hiddenCount }, count: visible.hiddenCount })}</Text></Pressable> : null}
      {undoActive?.phase === 'undo-window' ? <View accessibilityLiveRegion="polite" style={{ minHeight: seatLayerPickerTokens.size.minimumHitTarget, flexDirection: 'row', alignItems: 'center' }}><Text style={[{ flex: 1, color: theme.colors.text, fontFamily: theme.fontFamily }, styles.denseLineText]}>{scope.strings.translate('seatRemoved')}</Text><Pressable accessibilityRole="button" accessibilityLabel={scope.strings.translate('undo')} onPress={() => { void undo(); }} style={[styles.denseLineRemoveButton, { minWidth: seatLayerPickerTokens.size.minimumHitTarget, minHeight: seatLayerPickerTokens.size.minimumHitTarget, alignItems: 'center', justifyContent: 'center' }]}><Text style={[{ color: theme.colors.accent, fontFamily: theme.fontFamily, fontWeight: '700' }, styles.denseLineRemoveButtonText]}>{scope.strings.translate('undo')}</Text></Pressable></View> : null}
      {props.children}
    </View>
  );
}

function Run({ run, open, canRemove, theme, styles, onToggle, onRemove }: { readonly run: DenseTicketRun<SeatLayerPickerCartLine>; readonly open: boolean; readonly canRemove: boolean; readonly theme: ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>; readonly styles: SeatLayerPickerStyles; readonly onToggle: () => void; readonly onRemove: (line: DenseTicketLine<SeatLayerPickerCartLine>) => void }): React.ReactElement {
  const summary = <DenseLine key="summary" line={run.members[0]!} run={run} expanded={open} canRemove={canRemove} theme={theme} styles={styles} onToggle={run.isGroup ? onToggle : undefined} onRemove={onRemove} />;
  return !run.isGroup || !open ? <View>{summary}</View> : <View>{summary}{runMembersInSeatOrder(run).map((line, index) => <DenseLine key={`${line.identity.lineKey ?? line.identity.removalLabel ?? index}`} line={line} canRemove={canRemove} theme={theme} styles={styles} onRemove={onRemove} />)}</View>;
}

function DenseLine({ line, run, expanded, canRemove, theme, styles, onToggle, onRemove }: { readonly line: DenseTicketLine<SeatLayerPickerCartLine>; readonly run?: DenseTicketRun<SeatLayerPickerCartLine>; readonly expanded?: boolean; readonly canRemove: boolean; readonly theme: ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>; readonly styles: SeatLayerPickerStyles; readonly onToggle?: () => void; readonly onRemove: (line: DenseTicketLine<SeatLayerPickerCartLine>) => void }): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const total = run?.total ?? line.total;
  const amount = total === null || !line.currency ? '' : scope.formatMoney(total, line.currency);
  const unit = line.unitPrice === null || !line.currency ? '' : scope.formatMoney(line.unitPrice, line.currency);
  const seats = run?.seatsLabel ?? line.seatLabel;
  const identityParts = [line.section, line.rowLabel, seats].filter(Boolean);
  const identity = identityParts.join(' · ');
  const quantity = run?.quantity ?? line.quantity;
  const quantityAmount = quantity > 1 && unit ? `${quantity} × ${unit}` : '';
  const category = scope.snapshot?.categories.find((item) => item.key === line.categoryKey);
  const categoryColor = chartSeatLayerPickerColor(category?.color, theme.colors.accent);
  const identityLabel = [line.categoryLabel, identity].filter(Boolean).join(', ');
  return <View accessibilityLabel={`${identityLabel}, ${[quantityAmount, amount].filter(Boolean).join(', ')}`} style={[{
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: theme.colors.divider,
    flexDirection: 'row',
    height: seatLayerPickerTokens.size.denseLineHeight,
    paddingStart: onToggle ? 0 : 22,
  }, styles.denseLineContainer]}>
    <Pressable accessibilityRole={onToggle ? 'button' : undefined} accessibilityLabel={onToggle ? identity : undefined} accessibilityState={onToggle ? { expanded } : undefined} disabled={!onToggle} onPress={onToggle} style={{ alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: seatLayerPickerTokens.size.minimumHitTarget }}>
      {onToggle ? <Text accessible={false} style={{ color: theme.colors.mutedText, fontFamily: theme.fontFamily, fontSize: 24, lineHeight: 24, textAlign: 'center', transform: [{ rotate: expanded ? '90deg' : '0deg' }], width: 18 }}>›</Text> : <View accessible={false} style={{ backgroundColor: categoryColor, borderRadius: 4, height: 8, width: 8 }} />}
      <Text numberOfLines={1} style={[{ color: theme.colors.text, flex: 1, fontFamily: theme.fontFamily, fontSize: 13, fontWeight: '600', marginStart: 8 }, styles.denseLineText]}><Text style={{ fontWeight: '800' }}>{identityParts[0]}</Text>{identityParts.slice(1).map((part) => ` · ${part}`).join('')}</Text>
    </Pressable>
    {quantityAmount ? <><Text numberOfLines={1} style={[{ color: theme.colors.mutedText, fontFamily: theme.fontFamily, fontSize: 12, fontWeight: '700' }, styles.denseLineText]}>{quantityAmount}</Text><View style={{ width: 6 }} /></> : null}
    <Text numberOfLines={1} style={[{ color: theme.colors.text, fontFamily: theme.fontFamily, fontSize: 13, fontWeight: '800' }, styles.denseLineText]}>{amount}</Text>
    {canRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`${scope.strings.translate('removeSeat')} ${identity}`} onPress={() => onRemove(line)} style={{ alignItems: 'center', justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget, minWidth: seatLayerPickerTokens.size.minimumHitTarget }}><View style={[{
      alignItems: 'center',
      borderRadius: seatLayerPickerTokens.radius.button,
      height: 34,
      justifyContent: 'center',
      width: 34,
    }, styles.denseLineRemoveButton]}><Text style={[{ color: theme.colors.mutedText, fontFamily: theme.fontFamily, fontSize: 18 }, styles.denseLineRemoveButtonText]}>×</Text></View></Pressable> : <View style={{ width: 8 }} />}
  </View>;
}
