import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Modal: 'Modal', useWindowDimensions: () => ({ width: 1, height: 1 }) }));
vi.mock('../src/picker/blockedRegionsContext', () => ({ useSeatLayerPickerBlockedRegionCover: () => {} }));
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ SeatLayerPickerScopeReprovider: 'Scope', useSeatLayerPickerScope: () => ({}) }));

import { seatLayerPickerPromptOrientations } from '../src/picker/promptModal';

describe('the way a prompt stands on iOS', () => {
  it('opens sideways over a phone held sideways', () => {
    for (const [width, height] of [[667, 375], [852, 393], [932, 430]] as const) {
      expect(seatLayerPickerPromptOrientations({ width, height }))
        .toEqual(['landscape', 'landscape-left', 'landscape-right']);
    }
  });

  it('leaves an upright phone and a tablet to the platform', () => {
    for (const [width, height] of [[393, 852], [320, 568], [1024, 768], [820, 1180]] as const) {
      expect(seatLayerPickerPromptOrientations({ width, height })).toBeUndefined();
    }
  });
});
