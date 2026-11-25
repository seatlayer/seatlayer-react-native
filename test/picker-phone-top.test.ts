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
