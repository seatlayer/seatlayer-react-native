# SeatLayer React Native Seat Map SDK for Reserved Seating

[![CI](https://github.com/seatlayer/seatlayer-react-native/actions/workflows/ci.yml/badge.svg)](https://github.com/seatlayer/seatlayer-react-native/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@seatlayer/react-native?label=%40seatlayer%2Freact-native)](https://www.npmjs.com/package/@seatlayer/react-native)
[![React Native](https://img.shields.io/badge/React%20Native-%E2%89%A50.72-61DAFB.svg)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-compatible-000020.svg)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-types%20included-3178C6.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-111827.svg)](LICENSE)

The official SeatLayer React Native SDK for adding an interactive seating chart
and seat picker to iOS and Android ticketing apps. Render live seat
availability, create temporary holds, find best-available seats, and hand
secure booking to your trusted server through a typed TypeScript API.

[`@seatlayer/react-native` on npm](https://www.npmjs.com/package/@seatlayer/react-native) ·
[React Native seat-map documentation](https://docs.seatlayer.io/buyer-sdk/mobile/) ·
[SeatLayer reserved-seating platform](https://seatlayer.io/) ·
[Buyer seat-map demo (web)](https://app.seatlayer.io/demo/play) ·
[SeatLayer iOS seat map SDK](https://github.com/seatlayer/seatlayer-ios) ·
[SeatLayer Android seat map SDK](https://github.com/seatlayer/seatlayer-android) ·
[SeatLayer Flutter seat map SDK](https://github.com/seatlayer/seatlayer-flutter) ·
[SeatLayer AI Toolkit](https://github.com/seatlayer/seatlayer-ai-toolkit)

> **Production SDK:** Pin the documented `0.2.x` release and validate your
> event, checkout handoff, lifecycle, and supported physical devices before
> rollout.

## Install

### Expo

```bash
npm install @seatlayer/react-native
npx expo install react-native-webview
```

### React Native Community CLI

```bash
npm install @seatlayer/react-native react-native-webview
npx pod-install
```

React Native autolinks `react-native-webview` on Android and iOS. The package
ships no custom native module of its own, so there is nothing else to link.

Peer requirements are `react >= 18.2.0`, `react-native >= 0.72.0`, and
`react-native-webview >= 13.0.0`. TypeScript declarations are published with the
package — `dist/index.d.ts` for ESM and `dist/index.d.cts` for CommonJS — so no
`@types/*` package is needed.

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

For private channel inventory, mint short-lived buyer sessions on your backend
for the exact allowed origin `https://cdn.seatlayer.io`:

```tsx
const configuration = useMemo(
  () => ({
    event: 'ev_private',
    buyerAccessTokenProvider: (context) =>
      buyerBackend.mintSeatLayerAccess(context.reason),
  }),
  [],
);
```

## Run the example app

```bash
pnpm install
cd example && pnpm install && pnpm start
```

`example/App.tsx` is an Expo app that renders `SeatLayerView` full-screen and
prints the live selection. It talks to the real SeatLayer API, so set
`EXPO_PUBLIC_SEATLAYER_EVENT` to an event key you control. The browser-based
[buyer seat-map demo](https://app.seatlayer.io/demo/play) is a preview of the
wider SeatLayer buyer experience, not a React Native app.

## Security boundary

The React Native app **selects and holds** inventory. Your trusted backend
**inspects and books** the hold after payment or order validation.

- Never ship a SeatLayer secret key in JavaScript, the app bundle, or the WebView.
- Send only the `holdId` and your normal checkout context to your backend.
- Calculate the charge from server-inspected hold items, not device input.
- Reuse your stable order id as the booking reference for safe booking retries.
- Do not enable arbitrary navigation inside the SDK WebView.

Continue with
[seat holds and secure server-side checkout](https://docs.seatlayer.io/buyer-sdk/holds-and-checkout/)
before connecting payment and booking.

## React Native runtime and WebView architecture

`SeatLayerView` is a React component backed by
[`react-native-webview`](https://github.com/react-native-webview/react-native-webview).
It loads the immutable, version-pinned `seatlayer-js@0.66.0/mobile.html`
document and its lazy assets from `https://cdn.seatlayer.io`, which gives iOS
and Android one canonical HTTPS origin for origin-bound buyer sessions. Buyer
access tokens stay in memory and are never placed in a page URL, a React key, or
an event payload.

Application code never touches the WebView. It works through a typed
TypeScript controller whose contract matches the Web, iOS, and Flutter SDKs:

- range-negotiated protocol compatibility before the chart renders;
- one response per command, matched by correlation id;
- a 15-second command deadline, with late replies dropped rather than delivered;
- monotonic event ordering per event name, so a stale envelope is discarded; and
- forward-compatible unknown events and unknown payload fields.

See [the bridge contract](docs/bridge.md) for the wire-level details.

## Commands

`hold` · `resumeHold` · `extendHold` · `release` · `releaseLabels` ·
`bestAvailable` · `holdGA` · `setSeatTier` · `getSelection` ·
`selectObjects` · `deselectObjects` · `clearSelection` · `selectCategories` ·
`deselectCategories` · `setSelectableObjects` · `setMaxSelection` ·
`getSelectionValidity` · `refreshAccess` · `getCurrentHold` · `getGAAreas` ·
`getFloors` · `setFloor` · `setColorblindSafe` · `setViewMode` ·
`getViewMode` · `zoomIn` · `zoomOut` · `zoomToFit` · `destroy`

Every command returns a promise. Failures reject with `SeatLayerError`.
Inventory outcomes such as `sold_out`, `not_enough_together`, expired holds, and
hold conflicts remain distinct codes suitable for buyer-facing recovery.

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
`holdExpired` · `selectionValidityChanged` · `selectionValid` ·
`selectionInvalid` · `selectionLimit` · `accessExpired` · `accessUnavailable` ·
`selectedObjectsUnavailable` · `error` · `hint` · `gaClick` · `seatHover` ·
`deckTap` · `checkout` · `unknownEvent`

Unknown future events remain observable through `unknownEvent`; adding a bundle
event does not crash an older app.

## Layout and lifecycle

- Use a fixed-height or full-screen parent; do not put the map inside a vertical
  `ScrollView`. The canvas owns pan and pinch for map navigation.
- Keep `configuration` stable with `useMemo`.
- Change `reloadKey` to deliberately rebuild the WebView and bridge.
- `useSeatLayerController` disposes the controller automatically on unmount.
- Persist an open `holdId` and call `resumeHold` after app restoration.

## Frequently asked questions

### How do I add a seat map to a React Native app?

Install [`@seatlayer/react-native`](https://www.npmjs.com/package/@seatlayer/react-native)
alongside `react-native-webview`, create a controller with
`useSeatLayerController()`, and render `<SeatLayerView>` with your event key in a
full-screen or fixed-height parent. The quick start above is a complete
interactive seating chart with live availability; the
[React Native seat-map documentation](https://docs.seatlayer.io/buyer-sdk/mobile/)
covers lifecycle, commands, and events in depth.

### Is this a native seat map component or a WebView?

`SeatLayerView` is a React Native component with a typed TypeScript controller,
and it renders the SeatLayer buyer chart inside `react-native-webview`. The
package contains no custom native module — no podspec, no Java, Kotlin, Swift,
or Objective-C source — so application code only ever works through TypeScript
commands, payloads, errors, and events, never through the WebView itself.

### Does it work with Expo?

Yes. The only native dependency is `react-native-webview`, which Expo documents
and includes in Expo Go, so `npx expo install react-native-webview` is enough for
Expo Go on a supported Expo SDK. Development builds and bare React Native
projects work the same way, and the repository's own `example/` app is an Expo
app that renders the SDK.

### How do temporary seat holds work?

When a buyer selects seats, the SDK creates a temporary hold that reserves the
inventory against concurrent buyers for a limited window. The hold expires
automatically if checkout does not complete — the `holdExpired` event tells the
app to return the buyer to the map — and `extendHold` and `resumeHold` cover
longer checkouts and app restarts. This prevents double-selling without locking
seats forever.

### Can I use my own payment provider?

Yes. SeatLayer never processes payment inside the seat map. The app hands the
`holdId` to your backend, and your backend charges through any payment provider
you already use — Stripe, Adyen, Razorpay, or your own — before booking the hold
through the
[server-side checkout flow](https://docs.seatlayer.io/buyer-sdk/holds-and-checkout/).

### Which React Native and React versions are supported?

The package declares peer dependencies of `react >= 18.2.0`,
`react-native >= 0.72.0`, and `react-native-webview >= 13.0.0`, and it is
developed and tested against React Native 0.86 and React 19. Both iOS and
Android are supported; the SDK ships ESM, CommonJS, and TypeScript declaration
outputs from one build.

## Continue your React Native integration

- [Follow the React Native seat-map documentation](https://docs.seatlayer.io/buyer-sdk/mobile/)
  for setup, lifecycle, commands, events, and runtime requirements.
- [Connect seat holds to secure server-side checkout](https://docs.seatlayer.io/buyer-sdk/holds-and-checkout/)
  without exposing booking credentials in the app.
- [Run the complete checkout example](https://docs.seatlayer.io/examples/complete-checkout/)
  to connect the buyer hold id to payment and idempotent booking.
- [Compare SeatLayer's mobile seat map SDKs](https://docs.seatlayer.io/buyer-sdk/mobile/)
  when choosing between React Native, Flutter, and the native iOS and Android
  packages.
- [Review the buyer SDK installation options](https://docs.seatlayer.io/buyer-sdk/install/)
  when the same event also has to render on the web.
- [Explore the 3D seating chart for web buyers](https://seatlayer.io/3d-seat-map/)
  as a separate browser capability when comparing the wider buyer experience.
- [Point AI coding agents at the SeatLayer docs index](https://docs.seatlayer.io/llms.txt)
  (`llms.txt`) for an agent-readable map of the documentation.

## SeatLayer SDK ecosystem

| Surface | Package or source |
| --- | --- |
| React Native | [`@seatlayer/react-native`](https://www.npmjs.com/package/@seatlayer/react-native) (this package) |
| JavaScript | [`@seatlayer/js`](https://www.npmjs.com/package/@seatlayer/js) |
| React | [`@seatlayer/react`](https://www.npmjs.com/package/@seatlayer/react) |
| iOS | [`seatlayer-ios`](https://github.com/seatlayer/seatlayer-ios) |
| Flutter | [`seatlayer`](https://pub.dev/packages/seatlayer) |
| Android | [`seatlayer-android`](https://github.com/seatlayer/seatlayer-android) |
| Server SDKs | [Node.js, Python, PHP, Ruby, .NET, Java, and Go](https://docs.seatlayer.io/server-sdk/install/) |

## Development

```bash
pnpm install
pnpm validate
```

`pnpm validate` type-checks, runs the protocol tests, builds ESM, CommonJS, and
type declarations, and validates the npm tarball with `publint` and
`@arethetypeswrong/cli`. Production loads the exact hosted runtime; the package
does not generate or ship an inline Web document.

## License

MIT © SeatLayer
