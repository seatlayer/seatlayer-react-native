import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import { seatLayerAllFloors, type SeatLayerPickerSnapshot } from './models';

export type SeatLayerPickerWideNavigationLease = Readonly<{
  readonly controller: SeatLayerPickerController;
  readonly scopeSession: number;
  readonly runtimeSession: string;
}>;

export function seatLayerPickerWideNavigationLease(
  scope: SeatLayerPickerScopeValue,
  runtimeSession: string,
): SeatLayerPickerWideNavigationLease {
  return Object.freeze({
    controller: scope.controller,
    scopeSession: scope.sessionId,
    runtimeSession,
  });
}

export function sameSeatLayerPickerWideNavigationLease(
  left: SeatLayerPickerWideNavigationLease,
  right: SeatLayerPickerWideNavigationLease,
): boolean {
  return left.controller === right.controller &&
    left.scopeSession === right.scopeSession &&
    left.runtimeSession === right.runtimeSession;
}

/** Native wide chrome only owns controls advertised by the runtime contract. */
export function supportsSeatLayerPickerWideNavigation(
  controller: SeatLayerPickerController,
  command: string,
  capability?: string,
): boolean {
  return controller.mapController.isReady &&
    controller.mapController.supportsPickerCapability('native-chrome-contract-v1') &&
    (capability === undefined || controller.mapController.supportsPickerCapability(capability)) &&
    controller.mapController.supportsPickerCommand(command);
}

export function hasSeatLayerPickerWideNavigationSnapshot(
  scope: SeatLayerPickerScopeValue,
  lease: SeatLayerPickerWideNavigationLease,
): boolean {
  const snapshot = lease.controller.getSnapshot();
  return snapshot !== undefined && snapshot.sessionId === lease.runtimeSession &&
    scope.controller === lease.controller && scope.sessionId === lease.scopeSession;
}

export function canFocusSeatLayerPickerWideSection(
  scope: SeatLayerPickerScopeValue,
  lease: SeatLayerPickerWideNavigationLease,
  sectionId: string,
): boolean {
  const snapshot = lease.controller.getSnapshot();
  return hasSeatLayerPickerWideNavigationSnapshot(scope, lease) && snapshot !== undefined &&
    snapshot.map.rung !== 'seats' &&
    snapshot.sections.some((section) => section.id === sectionId) &&
    snapshot.map.focusedSectionId !== sectionId &&
    supportsSeatLayerPickerWideNavigation(lease.controller, 'picker.focusSection');
}

export function canChooseSeatLayerPickerWideFloor(
  scope: SeatLayerPickerScopeValue,
  lease: SeatLayerPickerWideNavigationLease,
  floorId: string,
): boolean {
  const snapshot = lease.controller.getSnapshot();
  if (!hasSeatLayerPickerWideNavigationSnapshot(scope, lease) || !snapshot ||
    !supportsSeatLayerPickerWideNavigation(lease.controller, 'picker.setFloor')) return false;
  if (floorId === seatLayerAllFloors) {
    return canOfferSeatLayerPickerWideAllFloors(snapshot, lease.controller) &&
      snapshot.map.floorMode !== 'all';
  }
  return snapshot.map.floors.some((floor) => floor.id === floorId) &&
    !(snapshot.map.floorMode !== 'all' && snapshot.map.activeFloorId === floorId);
}

export function canCompleteSeatLayerPickerWideFloor(
  scope: SeatLayerPickerScopeValue,
  lease: SeatLayerPickerWideNavigationLease,
  floorId: string,
): boolean {
  const snapshot = lease.controller.getSnapshot();
  return hasSeatLayerPickerWideNavigationSnapshot(scope, lease) && snapshot !== undefined &&
    supportsSeatLayerPickerWideNavigation(lease.controller, 'picker.setFloor') &&
    (floorId === seatLayerAllFloors
      ? canOfferSeatLayerPickerWideAllFloors(snapshot, lease.controller)
      : snapshot.map.floors.some((floor) => floor.id === floorId));
}

export function canOfferSeatLayerPickerWideAllFloors(
  snapshot: SeatLayerPickerSnapshot,
  controller: SeatLayerPickerController,
): boolean {
  return supportsSeatLayerPickerWideNavigation(controller, 'picker.setFloor', 'floor-stack-v1') &&
    (snapshot.map.floorMode === 'single' || snapshot.map.floorMode === 'all');
}

export function observeSeatLayerPickerWideNavigation(
  callback: ((value: string) => void | Promise<void>) | undefined,
  value: string,
): void {
  try {
    void Promise.resolve(callback?.(value)).catch(() => undefined);
  } catch { /* Observers never own the runtime action. */ }
}

export function reportSeatLayerPickerWideNavigation(
  scope: SeatLayerPickerScopeValue,
  error: unknown,
): void {
  try { scope.reportError(error); } catch { /* Host reporting is observational. */ }
}
