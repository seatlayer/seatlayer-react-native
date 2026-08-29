import React, { useMemo } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import { useSeatLayerPickerInsetLease } from '../src/picker/insetLeaseLifecycle';
import { SeatLayerPickerInsetOwnership, type SeatLayerPickerInsetLease } from '../src/picker/insetOwnership';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Band({
  lease,
  visible,
  height,
}: {
  readonly lease: SeatLayerPickerInsetLease;
  readonly visible: boolean;
  readonly height: number;
}): React.ReactElement | null {
  useSeatLayerPickerInsetLease(lease, visible ? { top: height } : undefined);
  return null;
}

function ImmersiveOwner({
  ownership,
  visible,
  top,
}: {
  readonly ownership: SeatLayerPickerInsetOwnership;
  readonly visible: boolean;
  readonly top: number;
}): React.ReactElement | null {
  const lease = useMemo(() => visible ? ownership.claim('immersive') : undefined, [ownership, visible]);
  useSeatLayerPickerInsetLease(lease, visible ? { top } : undefined);
  return null;
}

describe('picker inset lease lifecycle', () => {
  it('keeps one lease live through visibility and measured-height transitions', async () => {
    const writes: string[] = [];
    const ownership = new SeatLayerPickerInsetOwnership(
      (_band, insets) => writes.push(`set:${insets.top ?? 0}`),
      () => writes.push('remove'),
    );
    const lease = ownership.claim('legend');
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(Band, { lease, visible: true, height: 44 })); });
    await act(async () => { renderer.update(React.createElement(Band, { lease, visible: false, height: 44 })); });
    await act(async () => { renderer.update(React.createElement(Band, { lease, visible: true, height: 63 })); });
    expect(writes).toEqual(['set:44', 'set:0', 'set:63']);
    expect(writes).not.toContain('remove');
  });

  it('cannot let an old cleanup remove a newer owner for the same band', async () => {
    const writes: string[] = [];
    const ownership = new SeatLayerPickerInsetOwnership(
      (_band, insets) => writes.push(`set:${insets.top ?? insets.bottom ?? 0}`),
      () => writes.push('remove'),
    );
    const oldLease = ownership.claim('dock');
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(Band, { lease: oldLease, visible: true, height: 44 })); });
    const newLease = ownership.claim('dock');
    await act(async () => { renderer.update(React.createElement(Band, { lease: newLease, visible: true, height: 72 })); });
    expect(writes).toEqual(['set:44', 'set:72']);
    await act(async () => { renderer.unmount(); });
    expect(writes).toEqual(['set:44', 'set:72', 'remove']);
  });

  it('does not let a hidden immersive sibling claim or erase the visible band', async () => {
    const writes: string[] = [];
    const ownership = new SeatLayerPickerInsetOwnership(
      (_band, insets) => writes.push(`set:${insets.top ?? 0}`),
      () => writes.push('remove'),
    );
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(React.Fragment, undefined,
        React.createElement(ImmersiveOwner, { ownership, visible: true, top: 52 }),
        React.createElement(ImmersiveOwner, { ownership, visible: false, top: 31 }),
      ));
    });
    expect(writes).toEqual(['set:52']);
    await act(async () => {
      renderer.update(React.createElement(React.Fragment, undefined,
        React.createElement(ImmersiveOwner, { ownership, visible: false, top: 52 }),
        React.createElement(ImmersiveOwner, { ownership, visible: true, top: 31 }),
      ));
    });
    expect(writes).toEqual(['set:52', 'set:31']);
    await act(async () => { renderer.unmount(); });
    expect(writes).toEqual(['set:52', 'set:31', 'remove']);
  });
});
