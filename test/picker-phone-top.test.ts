import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/picker/SeatLayerMapControls', () => ({
  seatLayerPickerMapControlsEdgeInset: 12, seatLayerPickerMapControlsRailTop: 8,
}));
vi.mock('../src/picker/testModeIndicator', () => ({ seatLayerPickerTestModeIndicatorCompactHeight: 26 }));

import { planSeatLayerPickerPhoneTop } from '../src/picker/phoneTop';

const phone = {
  backPillDrawn: false, badgeCleared: false, controls: true, floorStripVisible: true, immersiveTopInset: 12,
  ownFloorStrip: false, testBadgeVisible: true, viewModeVisible: true,
  sideways: true, mapWidth: 844, badgeWidth: 85, viewModeWidth: 87, back: undefined, floorWidth: 395,
};

describe('the top of a phone map with level chips', () => {
  it('sideways keeps the badge, the pill and Map / 3D on one line where they fit', () => {
    // Centred on the control: 8 + (36 - 34) / 2, less the taller tap area.
    expect(planSeatLayerPickerPhoneTop(phone)).toMatchObject({
      badgeTop: 8, floorBottom: undefined, floorRail: { paddingStart: 111, paddingEnd: 111, top: 4 },
    });
    // 12 + 85 + 12 + 395 + 12 + 87 + 12 = 615.
    expect(planSeatLayerPickerPhoneTop({ ...phone, mapWidth: 615 }).floorRail)
      .toEqual({ paddingStart: 109, paddingEnd: 111, top: 4 });
    expect(planSeatLayerPickerPhoneTop({ ...phone, mapWidth: 614 })).toMatchObject({
      badgeTop: 102, floorBottom: 90, floorRail: { paddingStart: 12, paddingEnd: 12, top: 51 },
    });
    // A live event has no badge, and a venue without 3D no control.
    expect(planSeatLayerPickerPhoneTop({
      ...phone, badgeWidth: undefined, controls: false, floorWidth: 820, testBadgeVisible: false,
      viewModeVisible: false, viewModeWidth: undefined,
    }).floorRail).toEqual({ paddingStart: 12, paddingEnd: 12, top: 4 });
  });

  it('keeps two lines upright, until all is measured, and for an app with chips of its own', () => {
    for (const other of [
      { sideways: false }, { badgeWidth: undefined }, { viewModeWidth: undefined }, { floorWidth: undefined },
    ]) {
      expect(planSeatLayerPickerPhoneTop({ ...phone, ...other }).floorRail)
        .toEqual({ paddingStart: 12, paddingEnd: 12, top: 51 });
    }
    expect(planSeatLayerPickerPhoneTop({ ...phone, ownFloorStrip: true }).floorRail)
      .toEqual({ paddingStart: 0, paddingEnd: 0, top: 56 });
  });
});

describe('the way back of the 3D scene beside Map / 3D', () => {
  const scene = {
    ...phone, backPillDrawn: true, badgeCleared: true, floorStripVisible: false, floorWidth: undefined,
    mapWidth: 320, sideways: false, viewModeWidth: 120,
  };
  const plan = (width: number, height = 44) =>
    planSeatLayerPickerPhoneTop({ ...scene, back: { height, width } });

  it('shares the line where both fit, and takes the line under it where not', () => {
    // 10 + 170 + 8 + 120 + 12 = 320.
    expect(plan(170)).toMatchObject({ backTop: 12, badgeTop: 56 });
    expect(plan(171)).toMatchObject({ backTop: 56, badgeTop: 100 });
  });

  it('keeps the badge and the map clear of a taller one', () => {
    expect(plan(240, 60)).toMatchObject({ backTop: 56, badgeTop: 116, topHeight: 142 });
  });

  it('stays on the line without the control, and until both are measured', () => {
    for (const other of [
      { back: undefined }, { viewModeWidth: undefined }, { viewModeVisible: false }, { mapWidth: 0 },
    ]) {
      expect(planSeatLayerPickerPhoneTop({ ...scene, back: { height: 44, width: 300 }, ...other }).backTop).toBe(12);
    }
  });
});

describe('where the connection status stands on a phone', () => {
  it('upright without levels: after the badge on the top line, short of Map / 3D by 8', () => {
    expect(planSeatLayerPickerPhoneTop({ ...phone, sideways: false, floorStripVisible: false }).connection).toEqual({
      // 12 + 85 + 12 after the badge; 12 + 87 + 8 before the control; under the 36 of the control.
      top: 8, start: 109, end: 107, belowTop: 56, inset: 12,
    });
    // No badge on a live event: it starts at the map's margin.
    expect(planSeatLayerPickerPhoneTop({
      ...phone, sideways: false, floorStripVisible: false, testBadgeVisible: false, badgeWidth: undefined,
    }).connection.start).toBe(12);
  });

  it('upright with levels: on the badge line under the chips, centred on the badge, to the map margin', () => {
    expect(planSeatLayerPickerPhoneTop({ ...phone, sideways: false }).connection).toEqual({
      // The badge stands at 102; the status is 10 taller, so 5 higher.
      top: 97, start: 109, end: 12, belowTop: 145, inset: 12,
    });
  });

  it('sideways with the levels on the top line: under that line, the map\'s whole width', () => {
    expect(planSeatLayerPickerPhoneTop(phone).connection).toEqual({
      top: 56, start: 12, end: 12, belowTop: 56, inset: 12,
    });
  });

  it('waits for the badge and the control to be measured before it stands beside them', () => {
    const place = planSeatLayerPickerPhoneTop({
      ...phone, sideways: false, floorStripVisible: false, badgeWidth: undefined, viewModeWidth: undefined,
    }).connection;
    expect(place.start).toBe(Number.POSITIVE_INFINITY);
    expect(place.end).toBe(Number.POSITIVE_INFINITY);
  });
});
