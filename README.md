# SeatLayer for React Native

[![CI](https://github.com/seatlayer/seatlayer-react-native/actions/workflows/ci.yml/badge.svg)](https://github.com/seatlayer/seatlayer-react-native/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@seatlayer/react-native?label=%40seatlayer%2Freact-native)](https://www.npmjs.com/package/@seatlayer/react-native)
[![React Native](https://img.shields.io/badge/React%20Native-%E2%89%A50.72-61DAFB.svg)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-compatible-000020.svg)](https://expo.dev/)
[![License: MIT](https://img.shields.io/badge/license-MIT-111827.svg)](LICENSE)

The official React Native SDK for embedding interactive SeatLayer
reserved-seating maps in iOS and Android apps. It provides typed selection,
holds, best available, general admission, multi-floor controls, errors and
events over a versioned WebView bridge.

[Developer docs](https://docs.seatlayer.io/buyer-sdk/mobile/) ·
[Live demo](https://app.seatlayer.io/demo/play) ·
[Website](https://seatlayer.io/developers/) ·
[Web SDK](https://github.com/seatlayer/seatlayer-sdk) ·
[Flutter SDK](https://pub.dev/packages/seatlayer) ·
[iOS SDK](https://github.com/seatlayer/seatlayer-ios) ·
[Native Android SDK](https://github.com/seatlayer/seatlayer-android) ·
[AI Toolkit](https://github.com/seatlayer/seatlayer-ai-toolkit)

> **Public preview:** Validate `0.1.x` using a SeatLayer test event and physical
> iOS and Android devices before production rollout.

## Install

### Expo

```bash
npm install @seatlayer/react-native
npx expo install react-native-webview
```

No custom native SeatLayer module is used, so this SDK works with Expo Go when
the installed Expo SDK includes `react-native-webview`.

### React Native Community CLI

```bash
npm install @seatlayer/react-native react-native-webview
npx pod-install
```

React Native autolinks `react-native-webview` on Android and iOS.

## Quick start

Give the map a definite height or a full-screen parent. Keep the configuration
object stable so React rerenders do not reload the chart.

```tsx
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import {
  SeatLayerError,
  SeatLayerView,
  useSeatLayerController,
} from '@seatlayer/react-native';

export function SeatMapScreen() {
  const controller = useSeatLayerController();
  const configuration = useMemo(
    () => ({
      event: 'ev_your_event_key',
      currency: 'USD',
      maxSelection: 8,
    }),
    [],
  );

  useEffect(
    () =>
      controller.on('selectionChanged', (seats) => {
        console.log('Selected seats', seats);
      }),
    [controller],
  );

  return (
    <View style={{ flex: 1 }}>
      <SeatLayerView
        style={{ flex: 1 }}
        controller={controller}
        configuration={configuration}
        onReady={(info) => {
          console.log(
            `SeatLayer ready: protocol=${info.protocolRevision} mode=${info.mode}`,
          );
        }}
        onLoadError={(error) => {
          console.error(error.code, error.message);
        }}
      />
    </View>
  );
}
```

Drive checkout-related actions through the controller:

```tsx
try {
  const hold = await controller.bestAvailable(4);
  if (hold) {
    // Send only the hold id to your trusted backend.
    await beginCheckoutOnServer(hold.holdId);
  }
} catch (error) {
  if (error instanceof SeatLayerError) {
    showInventoryMessage(error.code, error.message);
  }
}
```

## Commands

`hold` · `resumeHold` · `extendHold` · `release` · `releaseLabels` ·
`bestAvailable` · `holdGA` · `setSeatTier` · `getSelection` ·
`getCurrentHold` · `getGAAreas` · `getFloors` · `setFloor` ·
`setColorblindSafe` · `zoomIn` · `zoomOut` · `zoomToFit` · `destroy`

All asynchronous command failures reject with `SeatLayerError`. Inventory
outcomes such as `sold_out`, `not_enough_together`, expired holds and conflicts
remain distinct codes suitable for buyer-facing recovery.

## Events

Subscribe with `controller.on(name, listener)`. The returned function removes
the listener.

```tsx
useEffect(() => {
  const offHold = controller.on('holdChanged', persistOpenHold);
  const offExpired = controller.on('holdExpired', returnBuyerToSelection);
  const offError = controller.on('error', reportSeatLayerError);
  return () => {
    offHold();
    offExpired();
    offError();
  };
}, [controller]);
```

Events: `ready` · `selectionChanged` · `holdChanged` · `holdRestored` ·
`holdExpired` · `error` · `hint` · `gaClick` · `seatHover` · `deckTap` ·
`checkout` · `unknownEvent`

Unknown future events remain observable through `unknownEvent`; adding a bundle
event does not crash an older app.

## Security boundary

The app selects and holds inventory. Your trusted backend validates payment,
inspects the hold and creates the booking.

- Never ship a SeatLayer secret key in JavaScript, the app bundle or WebView.
- Send only `holdId` and normal checkout context to your backend.
- Calculate the amount from server-inspected hold items, not device input.
- Use a stable order id as the booking reference for safe retries.
- Do not enable arbitrary navigation inside the SDK WebView.

Read [holds and checkout](https://docs.seatlayer.io/buyer-sdk/holds-and-checkout/)
before connecting a payment flow.

## How the bridge works

The npm package embeds the verified `seatlayer-js@0.48.1` bundle (sha256 `b459b0b6…`) in generated
inline HTML. This avoids the inconsistent local-file behavior of iOS and Android
WebViews while keeping the SDK JavaScript independent of a runtime CDN download.
Chart data and live inventory still come from the configured SeatLayer API.

The protocol guarantees:

- range-negotiated compatibility before rendering;
- one response per command using correlation ids;
- native command timeouts and late-reply rejection;
- monotonic event ordering per event type; and
- forward-compatible unknown events and fields.

See [the bridge contract](docs/bridge.md) for the wire-level details.

## Layout and lifecycle

- Use a fixed-height or full-screen parent; do not put the map inside a vertical
  `ScrollView`.
- Keep `configuration` stable with `useMemo`.
- Change `reloadKey` to deliberately rebuild the WebView.
- `useSeatLayerController` disposes the controller automatically.
- Persist an open `holdId` and call `resumeHold` after app restoration.

## Development

```bash
pnpm install
pnpm validate
cd example && pnpm install && pnpm start
```

`pnpm validate` regenerates the embedded document, type-checks, runs protocol
tests, builds ESM/CommonJS/types, and validates the npm tarball.

## Related resources

- [React Native mobile guide](https://docs.seatlayer.io/buyer-sdk/mobile/)
- [Buyer SDK installation](https://docs.seatlayer.io/buyer-sdk/install/)
- [Complete checkout example](https://docs.seatlayer.io/examples/complete-checkout/)
- [Agent-readable documentation](https://docs.seatlayer.io/llms.txt)
- [SeatLayer GitHub organization](https://github.com/seatlayer)

## SeatLayer SDK ecosystem

| Surface | Package or source |
| --- | --- |
| JavaScript | [`@seatlayer/js`](https://www.npmjs.com/package/@seatlayer/js) |
| React | [`@seatlayer/react`](https://www.npmjs.com/package/@seatlayer/react) |
| Flutter | [`seatlayer`](https://pub.dev/packages/seatlayer) |
| iOS | [`seatlayer-ios`](https://github.com/seatlayer/seatlayer-ios) |
| Android | [`seatlayer-android`](https://github.com/seatlayer/seatlayer-android) |
| Server SDKs | [Node.js, Python, PHP, Ruby, .NET, Java, and Go](https://docs.seatlayer.io/server-sdk/install/) |

## License

MIT © SeatLayer
