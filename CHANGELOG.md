# Changelog

## 0.2.0

- Uses the pinned hosted `seatlayer-js@0.66.0/mobile.html` document at
  `https://cdn.seatlayer.io`; buyer access tokens must be minted for that exact
  allowed origin. Private configuration fails closed unless the bridge advertises
  `native-access-provider`.
- Adds programmatic selection/category controls, exact-count validators, typed
  validity/access events, selected-object unavailability, and view-mode parity.
- Reloads the WebView when configuration identity changes without serializing
  credentials into React keys; callback-only rerenders no longer restart the
  handshake.
- Removes the unused legacy inline-document generation pipeline and reports the
  production dependency as `seatLayerHostedWebVersion`.

## 0.1.3

- Updated the vendored buyer runtime to `seatlayer-js@0.59.0` (sha256
  `89bc29fb…`), pulled from the production CDN and byte-verified against the
  published release. Brings the mobile buyer round — an always-visible price
  rail, a locator that survives a filling cart, a venue overview that no longer
  covers the seats, accessibility filters that cannot be missed — plus the
  engine fixes that reach every surface: section focus frames the section
  rather than its whole zone, the price filter dims section blocks and not only
  seats, and map type is sized for the device.

## 0.1.2

- Updated the vendored buyer runtime to `seatlayer-js@0.48.1` (sha256
  `b459b0b6…`) for the current responsive picker, access-token, checkout, and
  duplicate-title behavior.
- Corrected the runtime SDK version constant to match the package version.

## 0.1.1

- Re-vendored the buyer bundle at `seatlayer-js@0.35.0`
  (sha256 `814657ba…`), up from 0.30.1. 0.1.0 shipped a renderer five
  releases behind the published web SDK.

## 0.1.0

- Initial React Native public preview.
- Typed iOS and Android WebView component.
- Version-negotiated SeatLayer bridge with correlation, timeout and stale-event
  protection.
- Selection, holds, best available, general admission, floors, zoom,
  accessibility controls and typed events.
- Expo-compatible example and vendored `seatlayer-js@0.30.1` buyer bundle.
